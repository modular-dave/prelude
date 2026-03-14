"""
Lightweight MLX-LM inference server with Ollama-compatible API.
Runs on Apple Silicon natively via MLX.
"""
import json
import sys
import time
from flask import Flask, request, Response, jsonify
from mlx_lm import load, generate, stream_generate

app = Flask(__name__)

MODEL_NAME = "mlx-community/Qwen2.5-1.5B-Instruct-4bit"
print(f"Loading model: {MODEL_NAME}...")
model, tokenizer = load(MODEL_NAME)
print("Model loaded!")


def build_prompt(messages: list[dict]) -> str:
    """Build a chat prompt from messages using the tokenizer's chat template."""
    if hasattr(tokenizer, "apply_chat_template"):
        return tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
    # Fallback: simple concatenation
    parts = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        parts.append(f"<|{role}|>\n{content}")
    parts.append("<|assistant|>\n")
    return "\n".join(parts)


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    messages = data.get("messages", [])
    stream = data.get("stream", False)
    prompt = build_prompt(messages)

    if stream:
        def generate_stream():
            for response in stream_generate(model, tokenizer, prompt, max_tokens=512):
                chunk = {
                    "model": MODEL_NAME,
                    "message": {"role": "assistant", "content": response.text},
                    "done": False,
                }
                yield json.dumps(chunk) + "\n"
            yield json.dumps({"model": MODEL_NAME, "done": True}) + "\n"

        return Response(generate_stream(), mimetype="application/x-ndjson")
    else:
        result = generate(model, tokenizer, prompt, max_tokens=512, verbose=False)
        return jsonify(
            {
                "model": MODEL_NAME,
                "message": {"role": "assistant", "content": result},
                "done": True,
            }
        )


@app.route("/api/tags", methods=["GET"])
def tags():
    """Ollama-compatible model list endpoint."""
    return jsonify(
        {
            "models": [
                {
                    "name": MODEL_NAME,
                    "size": "~1GB",
                    "details": {"family": "qwen2.5", "parameter_size": "1.5B"},
                }
            ]
        }
    )


@app.route("/", methods=["GET"])
def health():
    return "MLX inference server running"


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 11434
    print(f"Starting MLX server on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
