#!/bin/bash

# Docker Hub 이미지 빌드 및 푸시 스크립트
# Usage: ./build-and-push.sh [tag]

set -e

# 기본 태그 설정
TAG=${1:-latest}
DOCKER_HUB_USER="byunbyun"  # 본인의 Docker Hub 사용자명으로 변경
IMAGE_NAME="dorea-pdf-ai"

echo "Building Docker image: $DOCKER_HUB_USER/$IMAGE_NAME:$TAG"

# Dorea Backend 이미지 빌드
docker build -t $DOCKER_HUB_USER/$IMAGE_NAME:$TAG ./Dorea-backend

echo "Pushing to Docker Hub..."

# Docker Hub에 푸시
docker push $DOCKER_HUB_USER/$IMAGE_NAME:$TAG

echo "Successfully pushed $DOCKER_HUB_USER/$IMAGE_NAME:$TAG to Docker Hub"

# docker-compose.hub.yml 파일의 이미지 태그 업데이트
if [ "$TAG" != "latest" ]; then
    echo "Updating docker-compose.hub.yml with tag: $TAG"
    sed -i.bak "s|$DOCKER_HUB_USER/$IMAGE_NAME:.*|$DOCKER_HUB_USER/$IMAGE_NAME:$TAG|g" docker-compose.hub.yml
    rm docker-compose.hub.yml.bak
fi

echo "Build and push completed!"
echo "To use the pre-built image:"
echo "docker compose -f docker-compose.hub.yml up"