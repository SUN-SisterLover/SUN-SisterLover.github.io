---
id: direct3d-01-init-window
index: '30'
title_zh: '【Direct3D_1】InitWindow'
excerpt_zh: '[DX12 快速教程(1) —— 做窗口_dx12开发-CSDN博客](https://blog.csdn.net/DGAF2198588973/article'
tags: ['计算机图形学', 'Direct3D']
date: '2026.03.16'
readTime: '2 min'
---

# 【Direct3D_1】InitWindow

[DX12 快速教程(1) —— 做窗口_dx12开发-CSDN博客](https://blog.csdn.net/DGAF2198588973/article/details/144488018?spm=1001.2014.3001.5501)

# 【Direct3D_2】DrawSkyblueWindow

[DX12 快速教程(2) —— 渲染天蓝色窗口_dx12组件-CSDN博客](https://blog.csdn.net/DGAF2198588973/article/details/144543014)

|对比项|001-InitWindow|002-DrawSkyblueWindow|
|---|---|---|
|窗口|有|有（沿用）|
|DX12 设备|无|有（Device、Adapter、Factory）|
|命令系统|无|有（Queue、Allocator、CommandList）|
|交换链 / 渲染目标|无|有（SwapChain、RTV、后台缓冲）|
|每帧绘制|无|有（清屏为天蓝）|
|CPU-GPU 同步|无|有（Fence + Event）|
```
Run(hins)
  │
  ├─ InitWindow(hins)           // 001 已有：注册窗口类、CreateWindow、ShowWindow
  ├─ CreateDebugDevice()        // 开启 D3D12 调试层（仅 Debug）
  ├─ CreateDevice()             // DXGI 工厂 → 枚举显卡 → 创建 D3D12 Device
  ├─ CreateCommandComponents()  // 命令队列 + 命令分配器 + 图形命令列表
  ├─ CreateRenderTarget()       // 交换链 + RTV 堆 + 为每个后台缓冲创建 RTV
  ├─ CreateFenceAndBarrier()    // Fence、Event、Present↔RTV 的资源屏障
  └─ RenderLoop()               // 消息循环 + 每帧调用 Render()
```






基于作者给的文件提出自己的学习疑问：

1.COM技术是什么？

COM（Component Object Model，组件对象模型） 是微软定的一套“二进制接口规范”：  
不同语言、不同时期编译的模块，只要按 COM 的规则实现接口，就能互相调用，而不依赖具体实现（不关心是 C++ 还是 C#，是哪个版本的 DLL）。
在 DirectX 里：D3D12、DXGI 的几乎所有 API（ID3D12Device、IDXGISwapChain 等）都是 COM 接口，所以写 DX12 会一直和 COM 打交道。

2.为什么 DirectX 用 COM？
1. 二进制兼容：显卡驱动、系统组件、你的程序可能用不同编译器、不同版本，COM 约定好“内存布局和调用方式”，大家就能互相调用。
2. 版本演进：可以在不破坏老接口的前提下加新接口（如 `ID3D12Device` → `ID3D12Device4`），你的代码用 `QueryInterface` 按需取新版本。
3. 生命周期：COM 对象用“引用计数”管理，不用你手动 `delete`，减少跨模块内存管理错误。
作者文档里提到“COM 技术”，指的就是：DX12 的 API 是以 COM 接口的形式暴露的。

3.COM 里要关心的三个概念
 1. 接口（Interface）
- 在 C++ 里就是一个只有纯虚函数的类，不包含数据，只有行为（方法）。
- 名字通常以 `I` 开头，例如：
    - `ID3D12Device`
    - `IDXGISwapChain3`
    - `ID3D12GraphicsCommandList`
- 代码拿到的都是“接口指针”，不关心下面到底是哪个厂家的实现（驱动、系统 DLL 等）。

2. 引用计数（Reference Counting）
- 每个 COM 对象内部有一个计数：有几个地方在用我。
- `AddRef()`：多了一个使用者，计数 +1。
- `Release()`：用完了，计数 -1；减到 0 就销毁对象。
- 规则：谁拿到接口指针谁就要在不用时 `Release()`；谁复制了指针就要 `AddRef()`。  
    用智能指针（如 `ComPtr`）就是为了自动帮你做这件事。

3. QueryInterface：同一个对象，多种接口
- 一个 COM 对象可以实现多个接口（例如既支持 `IDXGISwapChain1` 又支持 `IDXGISwapChain3`）。
- 手里有一个接口指针时，可以用 `QueryInterface(IID, &ppv)` 向这个对象“要另一个接口”。

# 【Direct3D_3】DrawRectangle

[DX12 快速教程(3) —— 画矩形_dx12 render pipeline-CSDN博客](https://blog.csdn.net/DGAF2198588973/article/details/144874380)

本章官方文档涉及到大量有关于图形学渲染管线的基本八股，建议搭配进行学习：

# 根签名

根签名的作用是将资源描述符绑定到相应的 GPU 寄存器槽上，供着色器高速访问使用，因为这个根签名类似 C++ 中的 Function Signature 函数签名 (同样是标识一组输入参数，同样是指定了函数接受的参数类型，同样是先将实参放在寄存器上)，所以得名根签名。

**如果我们把渲染管线比作一个函数，那么根签名就是这个函数的函数签名。**

# PSO

从“输入顶点数据” → “顶点着色器” → “光栅化” → “像素着色器” → “写入渲染目标”这一整条流程，叫渲染管线（Pipeline）。是“图形 API 的工作流程模型”

PSO：DX12 里把“这条管线的所有状态”打包成一个对象，包括用哪个 VS / PS（就是哪些 HLSL 编译出来的字节码）；输入布局（顶点结构）；光栅化状态（背面剔除、不剔除等）；混合状态、深度/模板状态；根签名、RTV 格式等。 在 C++ 里创建的就是这个“打包好的配置”。

HLSL：写的 .hlsl 文件，里面是 VSMain、PSMain 等函数；编译后变成字节码，塞进 PSO 的 VS、PS 字段；真正决定“一个顶点怎么变换”“一个像素什么颜色”的就是它。
