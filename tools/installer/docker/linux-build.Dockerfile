# Throwaway build environment for cross-building the Linux installer from
# Windows via Docker (see build.mjs's --target-platform linux delegation).
# Built with --no-cache and `docker rmi`'d after every run — nothing here is
# meant to persist, so keep it self-contained and reproducible from scratch.
FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl wget file pkg-config \
    libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev patchelf \
    rpm xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# The AppImage bundler downloads linuxdeploy/appimagetool and runs them; both
# normally mount themselves via FUSE, which needs /dev/fuse — not available
# in an unprivileged container. This makes them fall back to extracting and
# running directly instead.
ENV APPIMAGE_EXTRACT_AND_RUN=1

WORKDIR /workspace
