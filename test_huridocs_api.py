#!/usr/bin/env python3
"""
HURIDOCS API 테스트 스크립트
- OCR 처리 없이 바로 세그먼트 추출 테스트
- OCR 처리 후 세그먼트 추출 테스트
"""

import requests
import json
import sys
from pathlib import Path
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont
import io

# HURIDOCS API URL
HURIDOCS_URL = "http://localhost:8001"  # 또는 "http://localhost:5060"

def test_direct_segments(pdf_path, fast=False):
    """OCR 처리 없이 바로 세그먼트 추출"""
    print(f"\n=== OCR 없이 직접 세그먼트 추출 테스트 (fast={fast}) ===")
    print(f"파일: {pdf_path}")
    
    try:
        with open(pdf_path, 'rb') as f:
            files = {'file': (Path(pdf_path).name, f, 'application/pdf')}
            data = {'fast': str(fast).lower()}  # true/false 문자열로 전송
            
            response = requests.post(
                f"{HURIDOCS_URL}/",
                files=files,
                data=data,
                timeout=300
            )
            
        print(f"상태 코드: {response.status_code}")
        print(f"응답 헤더: {dict(response.headers)}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"세그먼트 개수: {len(data) if isinstance(data, list) else 'JSON이 아닌 응답'}")
                
                # 첫 번째 세그먼트 샘플 출력
                if isinstance(data, list) and len(data) > 0:
                    print(f"첫 번째 세그먼트 샘플:")
                    print(json.dumps(data[0], indent=2, ensure_ascii=False))
                
                # 세그먼트 타입 분포
                if isinstance(data, list):
                    types = {}
                    for segment in data:
                        seg_type = segment.get('type', 'unknown')
                        types[seg_type] = types.get(seg_type, 0) + 1
                    print(f"세그먼트 타입 분포: {types}")
                
                return data
                
            except json.JSONDecodeError:
                print("JSON 파싱 실패 - 응답 내용:")
                print(response.text[:500])
                return None
        else:
            print(f"오류 응답: {response.text}")
            return None
            
    except Exception as e:
        print(f"오류: {e}")
        return None

def test_ocr_then_segments(pdf_path, language="ko", fast=False):
    """OCR 처리 후 세그먼트 추출"""
    print(f"\n=== OCR 처리 후 세그먼트 추출 테스트 (fast={fast}) ===")
    print(f"파일: {pdf_path}, 언어: {language}")
    
    try:
        # 1단계: OCR 처리
        print("1단계: OCR 처리...")
        with open(pdf_path, 'rb') as f:
            files = {'file': (Path(pdf_path).name, f, 'application/pdf')}
            data = {'language': language}
            
            ocr_response = requests.post(
                f"{HURIDOCS_URL}/ocr",
                files=files,
                data=data,
                timeout=600
            )
        
        print(f"OCR 상태 코드: {ocr_response.status_code}")
        
        if ocr_response.status_code != 200:
            print(f"OCR 처리 실패: {ocr_response.text}")
            return None
        
        # OCR 결과를 임시 파일로 저장
        ocr_pdf_path = f"temp_ocr_{Path(pdf_path).name}"
        with open(ocr_pdf_path, 'wb') as f:
            f.write(ocr_response.content)
        
        print(f"OCR 처리 완료, 임시 파일: {ocr_pdf_path}")
        print(f"OCR 결과 파일 크기: {len(ocr_response.content)} bytes")
        
        # 2단계: 세그먼트 추출
        print("2단계: 세그먼트 추출...")
        with open(ocr_pdf_path, 'rb') as f:
            files = {'file': (Path(pdf_path).name, f, 'application/pdf')}
            data = {'fast': str(fast).lower()}  # true/false 문자열로 전송
            
            segments_response = requests.post(
                f"{HURIDOCS_URL}/",
                files=files,
                data=data,
                timeout=300
            )
        
        print(f"세그먼트 상태 코드: {segments_response.status_code}")
        
        if segments_response.status_code == 200:
            try:
                data = segments_response.json()
                print(f"세그먼트 개수: {len(data) if isinstance(data, list) else 'JSON이 아닌 응답'}")
                
                # 첫 번째 세그먼트 샘플 출력
                if isinstance(data, list) and len(data) > 0:
                    print(f"첫 번째 세그먼트 샘플:")
                    print(json.dumps(data[0], indent=2, ensure_ascii=False))
                
                # 세그먼트 타입 분포
                if isinstance(data, list):
                    types = {}
                    for segment in data:
                        seg_type = segment.get('type', 'unknown')
                        types[seg_type] = types.get(seg_type, 0) + 1
                    print(f"세그먼트 타입 분포: {types}")
                
                # 임시 파일 유지 (확인용)
                print(f"임시 파일 유지됨: {ocr_pdf_path}")
                
                return data
                
            except json.JSONDecodeError:
                print("JSON 파싱 실패 - 응답 내용:")
                print(segments_response.text[:500])
                return None
        else:
            print(f"세그먼트 추출 실패: {segments_response.text}")
            # 임시 파일 유지 (확인용)
            print(f"임시 파일 유지됨: {ocr_pdf_path}")
            return None
            
    except Exception as e:
        print(f"오류: {e}")
        # 임시 파일 유지 (확인용)  
        if 'ocr_pdf_path' in locals():
            print(f"임시 파일 유지됨: {ocr_pdf_path}")
        return None

def visualize_segments(pdf_path, segments_data, output_prefix="result"):
    """세그먼트 결과를 PDF 위에 시각화"""
    if not segments_data:
        print("시각화할 세그먼트 데이터가 없습니다.")
        return
    
    try:
        # PDF 열기
        doc = fitz.open(pdf_path)
        
        # 색상 매핑 (세그먼트 타입별)
        color_map = {
            'Text': (0, 0, 255),      # 파란색
            'Title': (255, 0, 0),     # 빨간색  
            'Picture': (0, 255, 0),   # 초록색
            'Figure': (255, 165, 0),  # 주황색
            'Table': (128, 0, 128),   # 보라색
            'Caption': (255, 192, 203), # 분홍색
            'List': (165, 42, 42),    # 갈색
            'Formula': (255, 255, 0), # 노란색
        }
        
        # 페이지별 세그먼트 그룹화
        pages_segments = {}
        for segment in segments_data:
            page_num = segment.get('page_number', 1) - 1  # 0부터 시작
            if page_num not in pages_segments:
                pages_segments[page_num] = []
            pages_segments[page_num].append(segment)
        
        # 각 페이지를 이미지로 변환하고 세그먼트 표시
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # PDF 페이지를 이미지로 변환 (해상도 높이기)
            mat = fitz.Matrix(2.0, 2.0)  # 2배 확대
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            
            # PIL Image로 변환
            img = Image.open(io.BytesIO(img_data))
            draw = ImageDraw.Draw(img)
            
            # 폰트 설정 (기본 폰트 사용)
            try:
                font = ImageFont.truetype("arial.ttf", 20)
            except:
                font = ImageFont.load_default()
            
            # 해당 페이지의 세그먼트 그리기
            if page_num in pages_segments:
                segment_count = {}  # 타입별 카운트
                
                for i, segment in enumerate(pages_segments[page_num]):
                    seg_type = segment.get('type', 'unknown')
                    
                    # 좌표 계산 (PDF 좌표계를 이미지 좌표계로 변환)
                    page_width = segment.get('page_width', 1)
                    page_height = segment.get('page_height', 1)
                    
                    # 정규화된 좌표를 실제 이미지 크기로 변환
                    left = int((segment.get('left', 0) / page_width) * img.width)
                    top = int((segment.get('top', 0) / page_height) * img.height)
                    width = int((segment.get('width', 0) / page_width) * img.width)
                    height = int((segment.get('height', 0) / page_height) * img.height)
                    
                    # 사각형 그리기
                    color = color_map.get(seg_type, (128, 128, 128))  # 기본 회색
                    
                    # 테두리 그리기
                    draw.rectangle([left, top, left + width, top + height], 
                                 outline=color, width=3)
                    
                    # 반투명 배경 (옵션)
                    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
                    overlay_draw = ImageDraw.Draw(overlay)
                    fill_color = (*color, 30)  # 30은 투명도
                    overlay_draw.rectangle([left, top, left + width, top + height], 
                                         fill=fill_color)
                    img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
                    draw = ImageDraw.Draw(img)
                    
                    # 라벨 텍스트
                    segment_count[seg_type] = segment_count.get(seg_type, 0) + 1
                    label = f"{seg_type}_{segment_count[seg_type]}"
                    
                    # 텍스트 배경
                    bbox = draw.textbbox((left, top - 25), label, font=font)
                    draw.rectangle(bbox, fill=color)
                    draw.text((left, top - 25), label, fill=(255, 255, 255), font=font)
            
            # 이미지 저장
            output_path = f"{output_prefix}_page_{page_num + 1}.png"
            img.save(output_path)
            print(f"페이지 {page_num + 1} 시각화 완료: {output_path}")
        
        # 통계 정보 출력
        type_counts = {}
        for segment in segments_data:
            seg_type = segment.get('type', 'unknown')
            type_counts[seg_type] = type_counts.get(seg_type, 0) + 1
        
        print(f"\n=== 세그먼트 통계 ===")
        for seg_type, count in type_counts.items():
            color = color_map.get(seg_type, (128, 128, 128))
            print(f"{seg_type}: {count}개 (색상: RGB{color})")
        
        doc.close()
        
    except Exception as e:
        print(f"시각화 오류: {e}")
        print("PyMuPDF와 Pillow 설치 필요: pip install PyMuPDF Pillow")

def test_huridocs_status():
    """HURIDOCS 서비스 상태 확인"""
    print(f"\n=== HURIDOCS 서비스 상태 확인 ===")
    
    try:
        response = requests.get(f"{HURIDOCS_URL}/", timeout=10)
        print(f"상태 코드: {response.status_code}")
        print(f"응답: {response.text}")
        return response.status_code == 200
    except Exception as e:
        print(f"서비스 연결 실패: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("사용법: python test_huridocs_api.py <PDF파일경로> [언어코드]")
        print("예시: python test_huridocs_api.py sample.pdf ko")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "ko"
    
    if not Path(pdf_path).exists():
        print(f"파일을 찾을 수 없습니다: {pdf_path}")
        sys.exit(1)
    
    print(f"HURIDOCS API 테스트 시작")
    print(f"대상 URL: {HURIDOCS_URL}")
    
    # 서비스 상태 확인
    if not test_huridocs_status():
        print("HURIDOCS 서비스에 연결할 수 없습니다.")
        print("Docker 컨테이너가 실행 중인지 확인하세요:")
        print("docker compose ps")
        sys.exit(1)
    
    # 테스트 실행
    direct_result = test_direct_segments(pdf_path)
    ocr_result = test_ocr_then_segments(pdf_path, language)
    
    # 결과 비교
    print(f"\n=== 결과 비교 ===")
    print(f"OCR 없음: {'성공' if direct_result else '실패'}")
    print(f"OCR 있음: {'성공' if ocr_result else '실패'}")
    
    if direct_result and ocr_result:
        print(f"세그먼트 개수 - OCR 없음: {len(direct_result)}, OCR 있음: {len(ocr_result)}")
    
    # 시각화
    if direct_result:
        print(f"\n=== OCR 없음 결과 시각화 ===")
        visualize_segments(pdf_path, direct_result, "direct_segments")
        
        # JSON 파일로 저장
        with open("direct_segments.json", "w", encoding="utf-8") as f:
            json.dump(direct_result, f, ensure_ascii=False, indent=2)
        print("직접 추출 결과 저장: direct_segments.json")
    
    if ocr_result:
        print(f"\n=== OCR 있음 결과 시각화 ===")
        visualize_segments(pdf_path, ocr_result, "ocr_segments")
        
        # JSON 파일로 저장
        with open("ocr_segments.json", "w", encoding="utf-8") as f:
            json.dump(ocr_result, f, ensure_ascii=False, indent=2)
        print("OCR 후 추출 결과 저장: ocr_segments.json")

if __name__ == "__main__":
    main()