//! Tiny static server + same-origin reverse proxy for the fanqie web client.
//!
//! Serves the static site and forwards `/api/*`, `/src/*`, `/healthz` and
//! `/readyz` to the fqapi-server. Same-origin means the browser never needs
//! CORS, and media keeps working with `?token=`.

use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderName, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Router;
use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::client::conn::http1;
use hyper_util::rt::TokioIo;
use tokio::net::{TcpListener, TcpStream};

const MAX_BODY: usize = 64 * 1024;

struct Cfg {
    root: PathBuf,
    api_addr: String,
}

#[tokio::main]
async fn main() {
    let mut listen = "127.0.0.1:8080".to_string();
    let mut api = "http://127.0.0.1:18921".to_string();
    let mut root = ".".to_string();

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--listen" => listen = args.next().unwrap_or(listen),
            "--api" => api = args.next().unwrap_or(api),
            "--root" => root = args.next().unwrap_or(root),
            "-h" | "--help" => {
                println!("fanqie-tiny-server [--listen 127.0.0.1:8080] [--api http://127.0.0.1:18921] [--root .]");
                return;
            }
            other => {
                eprintln!("unknown argument: {other}");
                std::process::exit(2);
            }
        }
    }

    let root = std::fs::canonicalize(&root).expect("static root does not exist");
    let api_addr = api
        .trim_end_matches('/')
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .to_string();
    let listen: SocketAddr = listen.parse().expect("invalid --listen address");

    let cfg = Arc::new(Cfg { root, api_addr });

    let app = Router::new()
        .route("/healthz", axum::routing::any(proxy))
        .route("/readyz", axum::routing::any(proxy))
        .fallback(route)
        .with_state(cfg.clone());

    let listener = TcpListener::bind(listen).await.expect("listen failed");
    println!(
        "fanqie-tiny-server on http://{listen} (root {}, api {})",
        cfg.root.display(),
        cfg.api_addr
    );
    axum::serve(listener, app).await.expect("server failed");
}

async fn route(State(cfg): State<Arc<Cfg>>, req: Request) -> Response {
    let path = req.uri().path().to_string();
    if path.starts_with("/api/")
        || path.starts_with("/src/")
        || path == "/healthz"
        || path == "/readyz"
    {
        return proxy(State(cfg), req).await;
    }
    static_file(&cfg, req).await
}

async fn proxy(State(cfg): State<Arc<Cfg>>, req: Request) -> Response {
    let (parts, body) = req.into_parts();

    let body = match body.collect().await {
        Ok(body) => body.to_bytes(),
        Err(_) => return fail(StatusCode::BAD_REQUEST, "cannot read request body"),
    };
    if body.len() > MAX_BODY {
        return fail(StatusCode::PAYLOAD_TOO_LARGE, "request body too large");
    }

    let stream = match TcpStream::connect(&cfg.api_addr).await {
        Ok(stream) => stream,
        Err(_) => return fail(StatusCode::BAD_GATEWAY, "api server is unreachable"),
    };
    let (mut sender, conn) = match http1::handshake(TokioIo::new(stream)).await {
        Ok(parts) => parts,
        Err(_) => return fail(StatusCode::BAD_GATEWAY, "api handshake failed"),
    };
    tokio::spawn(async move {
        let _ = conn.await;
    });

    let uri = parts
        .uri
        .path_and_query()
        .map(|p| p.as_str().to_string())
        .unwrap_or_else(|| "/".to_string());

    let mut upstream = hyper::Request::builder()
        .method(parts.method.clone())
        .uri(uri)
        .version(hyper::Version::HTTP_11);
    for (name, value) in parts.headers.iter() {
        if is_hop_by_hop(name) || name == header::HOST {
            continue;
        }
        upstream = upstream.header(name, value);
    }
    upstream = upstream.header(header::HOST, cfg.api_addr.clone());

    let request = match upstream.body(Full::new(body)) {
        Ok(request) => request,
        Err(_) => return fail(StatusCode::BAD_REQUEST, "invalid request"),
    };

    let upstream = match sender.send_request(request).await {
        Ok(response) => response,
        Err(_) => return fail(StatusCode::BAD_GATEWAY, "api request failed"),
    };

    let status = upstream.status();
    let mut response = Response::builder().status(status.as_u16());
    for (name, value) in upstream.headers().iter() {
        if is_hop_by_hop(name) {
            continue;
        }
        response = response.header(name, value);
    }

    let body = Body::from_stream(upstream.into_body().into_data_stream());
    response
        .body(body)
        .unwrap_or_else(|_| fail(StatusCode::BAD_GATEWAY, "bad response"))
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
    )
}

async fn static_file(cfg: &Cfg, req: Request) -> Response {
    if req.method() != Method::GET && req.method() != Method::HEAD {
        return fail(StatusCode::METHOD_NOT_ALLOWED, "method not allowed");
    }

    let raw = req.uri().path();
    let decoded = match percent_decode(raw) {
        Some(path) => path,
        None => return fail(StatusCode::BAD_REQUEST, "bad path"),
    };
    let rel = decoded.trim_start_matches('/');
    let rel = if rel.is_empty() { "index.html" } else { rel };
    let allowed = rel == "index.html"
        || rel == "app.css"
        || rel == "favicon.ico"
        || rel.starts_with("js/")
        || rel.starts_with("vendor/")
        || rel.starts_with("assets/");
    if !allowed {
        return fail(StatusCode::NOT_FOUND, "not found");
    }
    if Path::new(rel)
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return fail(StatusCode::FORBIDDEN, "bad path");
    }

    let candidate = cfg.root.join(rel);
    let resolved = match tokio::fs::canonicalize(&candidate).await {
        Ok(path) => path,
        Err(_) => return fail(StatusCode::NOT_FOUND, "not found"),
    };
    if !resolved.starts_with(&cfg.root) || !resolved.is_file() {
        return fail(StatusCode::NOT_FOUND, "not found");
    }

    let data = match tokio::fs::read(&resolved).await {
        Ok(data) => Bytes::from(data),
        Err(_) => return fail(StatusCode::NOT_FOUND, "not found"),
    };
    let mime = mime_of(&resolved);
    let head = req.method() == Method::HEAD;
    let len = data.len();

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, len)
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(if head {
            Body::empty()
        } else {
            Body::from(data)
        })
        .unwrap_or_else(|_| fail(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))
}

fn percent_decode(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' => {
                let hex = bytes.get(i + 1..i + 3)?;
                let value = u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?;
                out.push(value);
                i += 3;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    if out.contains(&0) || out.contains(&b'\\') {
        return None;
    }
    String::from_utf8(out).ok()
}

fn mime_of(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "mp4" => "video/mp4",
        "m4a" => "audio/mp4",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn fail(status: StatusCode, message: &str) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        message.to_string(),
    )
        .into_response()
}
