"""
RPack - RisuAI의 rpack_js.js를 파이썬으로 포팅한 모듈

단순한 바이트 치환 기반 인코딩/디코딩 라이브러리입니다.
원본: https://github.com/kwaroran/Risuai/tree/main/src/ts/rpack
"""

# rpack_map.bin 데이터 (512 bytes: encode_map 256 + decode_map 256)
_MAP_DATA = bytes.fromhex(
    "c40d1e0bbd2b3f55fc456ef566534f1ae0bb309486ba6bbf41506f9befdeb710"
    "611720df3289a89d6dabc990000c5dafd2c156e516649182657497ca23d652d1"
    "ffb4a0e82f8a58385a60199649dbd7c83b3e434ba56347aa6a2992f415cf6234"
    "78d31d3ce2058e2a570e1bcd4c2df2402c2579480fb27ab5a76c37e69c7b547e"
    "fe87dc9a02e433a2ebb12e03dd99a6b0e7d58818837cf6bee15c9fc321461f08"
    "4ed076125feefd8f44eaa35e8b2809359e69cc0ac78507ad4af377e967d4da84"
    "8093b64d73fa27267f04c6fbf1723951c236a968acf8edc5b9cbce75a43d81d9"
    "42701c9511bcd88c98f959a113f7147db3ec71c0e38df001ae5b310624223ab8"
    # decode_map (256 bytes)
    "2cf7848bc965fbb69faeb3032d0169741fe4a3ecee5c3421934a0f6ae262029e"
    "229cfd3cfc71c7c6ad596705706d8a4412fa24865fafd17a47cefe5063dd5106"
    "6f18e052a8099d56734cb8536cc3a00e19cf3e0d7e07326846ea48f9992eaba4"
    "49205e5535380cbcd3b1581679280a1ae1f2cdc439dba2ba6072767d95ef7fc8"
    "c0de3794bfb51481922545ace7f566a72b365ac113e34b3ae88d831b7c27b09a"
    "42eb87aadc548e7826d25729d4b7f82f8f8975f04177c21effd81511e5049717"
    "f331d09b00d7cab44f2a3bd9b26bda5da13f3061bd913d4ee6dfbe4d828c1d23"
    "109864f485337b9043bba988f1d6a51cf6cc6eb95b0b96edd5e9c5cb08a68040"
)

_encode_map: bytes = None
_decode_map: bytes = None


def _init_maps():
    """맵 데이터 초기화"""
    global _encode_map, _decode_map
    if _encode_map is None:
        _encode_map = _MAP_DATA[:256]
        _decode_map = _MAP_DATA[256:512]


def encode(data: bytes) -> bytes:
    """
    데이터를 RPack 형식으로 인코딩

    Args:
        data: 인코딩할 바이트 데이터

    Returns:
        인코딩된 바이트 데이터
    """
    _init_maps()
    return bytes(_encode_map[b] for b in data)


def decode(data: bytes) -> bytes:
    """
    RPack 형식 데이터를 디코딩

    Args:
        data: 디코딩할 바이트 데이터

    Returns:
        디코딩된 바이트 데이터
    """
    _init_maps()
    return bytes(_decode_map[b] for b in data)


# numpy 사용 가능 시 벡터화된 고속 버전
try:
    import numpy as np

    def encode_fast(data: bytes) -> bytes:
        """numpy를 사용한 고속 인코딩"""
        _init_maps()
        arr = np.frombuffer(data, dtype=np.uint8)
        encoded = np.frombuffer(_encode_map, dtype=np.uint8)[arr]
        return encoded.tobytes()

    def decode_fast(data: bytes) -> bytes:
        """numpy를 사용한 고속 디코딩"""
        _init_maps()
        arr = np.frombuffer(data, dtype=np.uint8)
        decoded = np.frombuffer(_decode_map, dtype=np.uint8)[arr]
        return decoded.tobytes()

except ImportError:
    # numpy 없으면 기본 버전 사용
    encode_fast = encode
    decode_fast = decode


if __name__ == "__main__":
    # 테스트
    test_data = b"Hello, RPack!"
    print(f"Original: {test_data}")

    encoded = encode(test_data)
    print(f"Encoded:  {encoded.hex()}")

    decoded = decode(encoded)
    print(f"Decoded:  {decoded}")

    assert decoded == test_data, "Round-trip test failed!"
    print("Round-trip test passed!")
