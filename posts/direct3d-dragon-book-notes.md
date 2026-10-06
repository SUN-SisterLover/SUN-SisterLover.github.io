---
id: direct3d-dragon-book-notes
index: '17'
title_zh: 'Direct3D基础学习'
title_en: 'Direct3D Fundamentals (Dragon Book Notes)'
excerpt_zh: 'DirectMath数学库中的核心向量类型是XMVECTOR，被映射到了SIMD硬件寄存器中，通过SIMD指令的配合可以让这种具有128位的类型能够一次性处理4'
excerpt_en: 'XMVECTOR, the core vector type of DirectXMath, maps to SIMD registers to process four floats at once.'
tags: ['计算机图形学', 'Shader', '渲染', 'Direct3D']
date: '2026.03.04'
readTime: '1 min'
---

# 向量

### 结构体定义
DirectMath数学库中的核心向量类型是`XMVECTOR`，被映射到了SIMD硬件寄存器中，通过SIMD指令的配合可以让这种具有128位的类型能够一次性处理4个32位浮点数。开启SEE2后，此类型在x86和x64的平台的定义是：
```
typedof __m128 XMVECTOR;
```
这里的__m128是一种特殊的SIMD类型，必须使用该类型才可以充分利用SIMD技术。


`XMVECTOR`类型的数据需要按照16字节来对其，其中的数据成员一般使用`XMFLOAT2`，`XMFLOAT3`，`XMFLOAT4`来加以代替。
这些结构体的定义如下：
```c++
struct XMFLOAT2
{
	float x;
	float y;
	
	XMFLOAT2(){}
	XMFLOAT2(float _x, float _y) : x(_x), y(_y) {}
	explicit XMFLOAT2(_In_read_(2) const float *pArray) :
		x(pArray[0]), y(pArray[1]) {}
		
	XMFLOAT2& operator= (const XMFLOAT2& Float2)
	{ x = Float2.x; y = Float2.y; return *this; }
}
```

如果直接使用这种类型，依旧无法发挥SIMD的全部高效特性，因此需要将其类型的实例转换为`XMVECTOR`类型。

### 加载和存储
```C++
// 将数据从 XMFLOAT2 类型中加载到 XMVECTOR 类型 
XMVECTOR XM_CALLCONV XMLoadFloat2(const XMFLOAT2 *pSource); 
// 将数据从 XMFLOAT3 类型中加载到 XMVECTOR 类型 
XMVECTOR XM_CALLCONV XMLoadFloat3(const XMFLOAT3 *pSource);
// 将数据从 XMFLOAT4 类型中加载到 XMVECTOR 类型 
XMVECTOR XM_CALLCONV XMLoadFloat4(const XMFLOAT4 *pSource);

// 将数据从 XMVECTOR 类型存储到 XMFLOAT2 类型 
void XM_CALLCONV XMStoreFloat2(XMFLOAT2 *pDestination, FXMVECTOR V); 
// 将数据从 XMVECTOR 类型存储到 XMFLOAT3 类型 
void XM_CALLCONV XMStoreFloat3(XMFLOAT3 *pDestination, FXMVECTOR V); 
// 将数据从 XMVECTOR 类型存储到 XMFLOAT4 类型 
void XM_CALLCONV XMStoreFloat4(XMFLOAT4 *pDestination, FXMVECTOR V);
```

如果只希望从XMVECTOR实例中得到某一个向量分量或者是将某一个向量分享转化为XMVECTOR类型时，可以用以下方法：
```C++
float XM_CALLCONV XMVectorGetX(FXMVECTOR V); 
float XM_CALLCONV XMVectorGetY(FXMVECTOR V); 
float XM_CALLCONV XMVectorGetZ(FXMVECTOR V); 
float XM_CALLCONV XMVectorGetW(FXMVECTOR V); 

XMVECTOR XM_CALLCONV XMVectorSetX(FXMVECTOR V, float x); 
XMVECTOR XM_CALLCONV XMVectorSetY(FXMVECTOR V, float y); 
XMVECTOR XM_CALLCONV XMVectorSetZ(FXMVECTOR V, float z); 
XMVECTOR XM_CALLCONV XMVectorSetW(FXMVECTOR V, float w);
```
