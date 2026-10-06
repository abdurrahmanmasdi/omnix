#!/bin/bash
set -e
cd "$(dirname "$0")/.."
python3 -m grpc_tools.protoc -I./proto --python_out=. --grpc_python_out=. ./proto/agent.proto ./proto/rag.proto
