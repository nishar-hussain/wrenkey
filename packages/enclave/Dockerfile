# syntax=docker/dockerfile:1
#
# WVC Enclave App Dockerfile (PRD §10.5)
#
# This builds the Rust enclave binary into a Docker image that `nitro-cli
# build-enclave` converts into an Enclave Image File (EIF). Reproducibility is
# load-bearing: the base image is pinned by digest, Cargo.lock is committed,
# and path prefixes are remapped so the binary hash is deterministic.
#
# The actual Rust source (src/main.rs implementing the harness per PRD §14 +
# the signing workload per PRD §7.1) lives alongside this file. This Dockerfile
# is the build contract; the source is a separate Rust/AWS effort (PRD §33).

FROM rust:1.79-slim@sha256:REPLACE_WITH_PINNED_DIGEST AS builder
WORKDIR /build

# Copy manifests first for layer caching
COPY Cargo.lock Cargo.toml ./
COPY src ./src

RUN rustup target add x86_64-unknown-linux-musl
ENV RUSTFLAGS="--remap-path-prefix=/build=."
ENV SOURCE_DATE_EPOCH=0

RUN cargo build --release --target x86_64-unknown-linux-musl --locked

FROM scratch AS final
COPY --from=builder /build/target/x86_64-unknown-linux-musl/release/wvc-app /app/wvc-app
ENTRYPOINT ["/app/wvc-app"]
