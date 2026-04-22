# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM golang:1.26.2-bookworm AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /build

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=bind,source=go.mod,target=go.mod \
    --mount=type=bind,source=go.sum,target=go.sum \
    go mod download -x

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=bind,source=.,target=/build,ro \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -o /bin/mcp-server main.go

FROM gcr.io/distroless/static:nonroot
WORKDIR /
COPY --from=builder /bin/mcp-server ./mcp-server

USER 65532:65532
ENTRYPOINT ["./mcp-server"]
