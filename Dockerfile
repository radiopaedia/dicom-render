# Architecture, e.g. amd64 or arm64v8
ARG ARCHPREFIX=arm64v8

# Ubuntu release
ARG RELEASE=jammy


# build with docker buildx build --platform linux/arm64 .
# Note: this needs host system (binfmt) support
# https://docs.docker.com/build/building/multi-platform/#qemu
FROM ${ARCHPREFIX}/ubuntu:${RELEASE}

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG C.UTF-8

# Install Nodesource repo key
RUN apt-get update && \
	apt-get install -y ca-certificates curl gnupg && \
	mkdir -p /etc/apt/keyrings && \
	curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

# Install Node.js
ARG NODE_MAJOR=20

RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
	apt-get update && \
	apt-get install -y nodejs

# Install node-canvas build dependencies
# https://github.com/Automattic/node-canvas/wiki/Installation:-Ubuntu-and-other-Debian-based-systems
RUN apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev #not used: #libgif-dev librsvg2-dev

# Install yarn for Cornerstone.js
RUN corepack enable && \
	corepack prepare yarn@1.22.19 --activate


# Build the patched Cornerstone.js libraries
WORKDIR /dicom-render
COPY install.sh .

RUN ./install.sh
##=RUN npm run build:vendor

# Install runtime dependencies
COPY package*.json .
RUN npm install

# Build the dicom.js module that is used by dicom-render.js to render DICOM images
COPY lib/* ./lib/
COPY rollup.config.mjs .
# https://docs.docker.com/engine/reference/builder/#copy---parents will solve this but until then...

RUN npm run build:rollup

# Copy runtime files
COPY dicom-render.js .

ENTRYPOINT [ "/dicom-render/dicom-render.js" ]
