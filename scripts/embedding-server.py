#!/usr/bin/env python3
"""Local OpenAI-compatible embedding server using fastembed (ONNX Runtime).

Runs on port 11435 by default. Serves POST /v1/embeddings with the same
request/response shape as OpenAI's API so the Cortex SDK can use it directly.

Usage:
    python scripts/embedding-server.py [--port 11435] [--model BAAI/bge-small-en-v1.5]
"""

import argparse
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from fastembed import TextEmbedding

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"  # 384 dims, fast, good quality
DEFAULT_PORT = 11435


class EmbeddingHandler(BaseHTTPRequestHandler):
    model: TextEmbedding = None  # type: ignore
    model_name: str = DEFAULT_MODEL

    def do_POST(self):
        if self.path != "/v1/embeddings":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length))

        text_input = body.get("input", "")
        if isinstance(text_input, str):
            text_input = [text_input]

        embeddings = list(self.model.embed(text_input))

        response = {
            "object": "list",
            "data": [
                {
                    "object": "embedding",
                    "index": i,
                    "embedding": emb.tolist(),
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

    def log_message(self, format, *args):
        print(f"[embed] {args[0]}")


def main():
    parser = argparse.ArgumentParser(description="Local embedding server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL)
    args = parser.parse_args()

    print(f"Loading model: {args.model} ...")
    EmbeddingHandler.model = TextEmbedding(model_name=args.model)
    EmbeddingHandler.model_name = args.model

    # Warm up
    list(EmbeddingHandler.model.embed(["warmup"]))
    print(f"Model ready. Dimensions: {list(EmbeddingHandler.model.embed(['test']))[0].shape[0]}")

    server = HTTPServer(("127.0.0.1", args.port), EmbeddingHandler)
    print(f"Embedding server listening on http://127.0.0.1:{args.port}/v1/embeddings")
    server.serve_forever()


if __name__ == "__main__":
    main()
