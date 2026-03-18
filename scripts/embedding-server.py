#!/usr/bin/env python3
"""Local OpenAI-compatible embedding server using MLX (Apple Silicon).

Runs on port 11435 by default. Serves POST /v1/embeddings with the same
request/response shape as OpenAI's API so the Cortex SDK can use it directly.

Usage:
    python scripts/embedding-server.py [--port 11435] [--model sentence-transformers/all-MiniLM-L6-v2]
"""

import argparse
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

import mlx.core as mx
from mlx_embeddings import load as mlx_load

DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"  # 384 dims, fast
DEFAULT_PORT = 11435


class EmbeddingHandler(BaseHTTPRequestHandler):
    model = None
    tokenizer = None
    model_name: str = DEFAULT_MODEL
    dims: int = 0

    def do_POST(self):
        if self.path != "/v1/embeddings":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length))

        text_input = body.get("input", "")
        if isinstance(text_input, str):
            text_input = [text_input]

        embeddings = self._embed(text_input)

        response = {
            "object": "list",
            "data": [
                {
                    "object": "embedding",
                    "index": i,
                    "embedding": emb,
                }
                for i, emb in enumerate(embeddings)
            ],
            "model": self.model_name,
            "usage": {
                "prompt_tokens": sum(len(t.split()) for t in text_input),
                "total_tokens": sum(len(t.split()) for t in text_input),
            },
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "model": self.model_name,
                "dimensions": self.dims,
            }).encode())
            return
        self.send_error(404)

    def _embed(self, texts: list[str]) -> list[list[float]]:
        t = self.tokenizer._tokenizer
        encoded = t(
            texts,
            return_tensors="np",
            padding=True,
            truncation=True,
            max_length=512,
        )
        inputs = {k: mx.array(v) for k, v in encoded.items()}
        output = self.model(**inputs)
        hidden = output.last_hidden_state
        mask = inputs["attention_mask"]
        # Mean pooling
        pooled = (hidden * mask[:, :, None]).sum(axis=1) / mask.sum(
            axis=1, keepdims=True
        )
        mx.eval(pooled)
        return [row.tolist() for row in pooled]

    def log_message(self, format, *args):
        print(f"[mlx-embed] {args[0]}")


def main():
    parser = argparse.ArgumentParser(description="MLX embedding server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL)
    args = parser.parse_args()

    print(f"Loading MLX model: {args.model} ...")
    model, tokenizer = mlx_load(args.model)
    EmbeddingHandler.model = model
    EmbeddingHandler.tokenizer = tokenizer
    EmbeddingHandler.model_name = args.model

    # Warm up and detect dimensions
    t = tokenizer._tokenizer
    encoded = t(["warmup"], return_tensors="np", padding=True, truncation=True)
    inputs = {k: mx.array(v) for k, v in encoded.items()}
    output = model(**inputs)
    hidden = output.last_hidden_state
    mask = inputs["attention_mask"]
    pooled = (hidden * mask[:, :, None]).sum(axis=1) / mask.sum(
        axis=1, keepdims=True
    )
    mx.eval(pooled)
    dims = pooled.shape[1]
    EmbeddingHandler.dims = dims
    print(f"Model ready. Dimensions: {dims}")

    port = args.port
    for attempt in range(10):
        try:
            server = HTTPServer(("127.0.0.1", port), EmbeddingHandler)
            break
        except OSError:
            if attempt == 9:
                raise
            port += 1
    print(f"Embedding server listening on http://127.0.0.1:{port}/v1/embeddings")
    server.serve_forever()


if __name__ == "__main__":
    main()
