---
id: radiometry-and-brdf
index: '29'
title_zh: '辐射度量学与BRDF'
title_en: 'Radiometry and BRDF'
excerpt_zh: '[2.3.1 辐射亮度（Radiance）& 色温（Color Temperature）& 颜色的量化 · 《音视频开发技术：原理与实践》©](https://'
excerpt_en: 'Radiance, color temperature, and the quantization of color — the math behind BRDF.'
tags: ['计算机图形学', '渲染', '数学']
date: '2026.03.16'
readTime: '5 min'
---

【文章推荐】：
[2.3.1 辐射亮度（Radiance）& 色温（Color Temperature）& 颜色的量化 · 《音视频开发技术：原理与实践》©](https://arikanli.cyberfederal.io/Chapter_2/Language/cn/Docs_2_3_1.html)
[(13 封私信 / 4 条消息) 辐射度量学 - 知乎](https://zhuanlan.zhihu.com/p/139468429)
[(13 封私信 / 2 条消息) 从辐射度量学到渲染方程 - 知乎](https://zhuanlan.zhihu.com/p/662896674)
[(13 封私信 / 4 条消息) 计算机图形学十四：基于物理渲染的基础知识(辐射度量学，BRDF和渲染方程) - 知乎](https://zhuanlan.zhihu.com/p/145410416)

【视频推荐】：


# 辐射度量学

## 辐射能量$Q$

能量的单位是焦耳$J$，光以光子的形式向周围发散能量，因此光的能量是不连续的，其被切成了一份一份。对于每一个光子携带的能量我们有$Q=hv$，又因为${\lambda}v=c$波长，频率和光速的关系，我们又可以把能量写为：
$$Q = \frac{hc}{\lambda}$$

## 辐射通量/功率$\Phi$
功率的单位为焦每秒，或者**瓦特**，将能量总量除以总时间就可以得到平均功率。而对于瞬时功率，或者瞬时辐射通量来说，我们考虑他们的微分：
$$\Phi = \frac{dQ}{dt}$$

补：【光通量】光对人眼的主观亮度贡献，相当于对光谱按人眼敏感度加权后的功率。
我们把光源将功率转换成亮度的能力称之为光源的发光效率。发光效率的单位是**流明每瓦特**。

## 辐射强度$I$

辐射强度，是指光源发出的每单位立体角上的功率。
$$I(\omega) = \frac{d\Phi}{d\omega}$$
### 立体角
以观测点为球心，构造一个单位球面；任意物体投影到该单位球面上的投影面积，即为该物体相对于该观测点的立体角。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320102948.png)

在二维平面圆中，我们可以通过弧长与半径的比值计算出角度：
$$L = 2\pi r$$
$$\frac{l}{L} = \frac{\theta}{2\pi}$$
$$\theta = \frac{l}{r}$$
我们将其延伸到三维立体空间的球上时，立体角就是投影面积与半径平方的比值：
$$\Omega = \frac{A}{r^2}$$
### 单位立体角
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320103320.png)
单位立体角可以通过 $\theta$、$\phi$ 对球面上一块微元（面积近似为矩形）进行计算，最终有：

$$\mathrm{d}\omega = \frac{\mathrm{d}A}{r^2} = \sin\theta\,\mathrm{d}\theta\,\mathrm{d}\phi$$
证明如下：对球面 $S^2$ 上立体角积分，结果为 $4\pi$：
$$\Omega = \int_{S^2} \mathrm{d}\omega$$
$$= \int_{0}^{2\pi} \int_{0}^{\pi} \sin\theta\,\mathrm{d}\theta\,\mathrm{d}\phi$$
$$= \int_{0}^{2\pi} 2\,\mathrm{d}\phi$$
$$= 4\pi$$
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320103549.png)

### 各向同性点光源计算辐照强度
对于一个向四周发射的辐射强度都相等的一个点光源，我们对其单位立体角下的radiant intensity进行积分，就可以得到点光源的辐射通量
$$\Phi = \int_{S^2} I\,\mathrm{d}\omega$$
$$I = \frac{\mathrm{d}Q}{\mathrm{d}t}$$
$$\Phi = I \int_{S^2} \mathrm{d}\omega$$
$$\Phi = 4\pi I$$
$$I = \frac{\Phi}{4\pi}$$
## 辐射照射度/辐照度$E$

我们把辐照度定义成，单位面积接收光的功率，辐照度的单位为流明每平方米，或者勒克斯（lux，字母lx表示）。
$$E = \frac{\mathrm{d}\Phi}{\mathrm{d}A}$$
如果我们的光源是一个点光源，其向四周均匀发射光线，那么距离光源半径为$r$地方的辐照度为：
$$E = \frac{\Phi}{4\pi r^2}$$

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320104114.png)
对下图$A_1$来说，受到光表面的辐照度为$E = \frac{\mathrm{d}\Phi}{\mathrm{d}A}$，对于$A_2$来说，受到光表面的辐照度为$E = \frac{\mathrm{d}\Phi}{\mathrm{d}A_2}$，同时根据三角形关系可以得到$A_2cos\theta=A_1$，因此可以计算出$A_2$表面$E = \frac{\mathrm{d}\Phi \cos\theta}{\mathrm{d}A}$。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260319175916.png)
## 辐射亮度$L$
是指**每单位立体角，每单位垂直面积**上所发射(emitted)、反射(reflected)、透射(transmitted)或接收(received)的辐射通量(功率)。符号$L$。
对微元角度和面积同时取了通量的微分（理解为二位随机变量密度）
$$L(\mathrm{p}, \omega) \equiv \frac{\mathrm{d}^2 \Phi(\mathrm{p}, \omega)}{\mathrm{d}\omega\,\mathrm{d}A\cos\theta}$$
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320104240.png)
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320104254.png)
【总结】记辐射亮度为 $L_e$，辐射强度为 $I_e$，辐射通量为 $\Phi_e$，辐射照射度为 $E_e$。那么四者间的关系为：
$$I_e = \frac{\mathrm{d}\Phi_e}{\mathrm{d}\Omega}\;\rightarrow\;\Phi_e = \int_{\Sigma} I_e \, \mathrm{d}\Omega$$
$$E_e = \frac{\mathrm{d}\Phi_e}{\mathrm{d}A}\;\rightarrow\;\mathrm{d}^2\Phi_e = \mathrm{d}E_e \cdot \mathrm{d}A$$
$$L_e = \frac{\mathrm{d}^2\Phi_e}{\mathrm{d}A \, \mathrm{d}\Omega \cos \theta}= \frac{\mathrm{d}E_e}{\mathrm{d}\Omega \cdot \cos \theta}$$
#### Irradiance & Radiance
- Irradiance（E）是指每单位**照射**面积所接收到的power
- Radiance（L）是指每单位立体角，每单位垂直面积上的power

我们对式子进行整理和积分，会发现：
$$dE(p,\omega)=L_i(p,\omega)\cos\theta \, d\omega$$
$$E(p)=\int_{H^2} L_i(p,\omega)\cos\theta \, d\omega$$
由这个积分式可知，对于点P的Irradiance，它是由所有方向的入射光Radiance贡献得到的。

## BRDF
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320114049.png)一个微元面积接收一定方向的光，然后再向不同方向将这份能量辐射出去。  
对于不同的材质我们反射的光的分布是不同的（对于镜面而言会集中分布在镜面反射方向，而对于一个粗糙表面而言光会随机发散）  
而BRDF就是描述这样一个接受了入射光后，反射光线会如何分布的一个函数

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320114138.png)

由此可见，$P$点接受的辐照度和$\overrightarrow{PO}$方向的辐亮度的比值是一个固定值，其中和$P$点表面的属性、入射光线$\overrightarrow{LP}$以及出射光线$\overrightarrow{PO}$相关，和光源或其他的任何值都无关。我们把入射光线记作$\omega_i$，出射光线记作$\omega_o$，那么我们把这个反射比率函数用$f_r(p,\omega_i,\omega_o)$表示。


# 渲染方程
## 反射方程
首先我们需要注意到反射方程，反射方程描述了在给定入射光和反射规律的情况下，从点 $x$沿着观察方向$\omega_0$的出射光：
$$L_o(x, \omega_o) = \int_{H^2} f_r(x, \omega_o→\omega_i)\, L_i(x, \omega_i)\, \cos \theta_i \, d\omega_i$$
## 渲染方程
比起反射方程，多了自发光项

$$L_o(x, \omega_o) = L_e(x, \omega_o) +\int_{H^2} f_r(x, \omega_o, \omega_i)\, L_i(x, \omega_i)\, \cos \theta_i \, d\omega_i$$
### 点光源和单个物体
(点光源对一个点来说自然只有一个方向有入射光，所以这里没有了积分)
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260325110456.png)

### 多个点光源一个物体
将这些所有的点光源的贡献全部求和即可
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260325110640.png)

### 面光源和一个物体
面光源就相当于无穷多个点光源的集合，只需要对面光源所在的立体角范围进行积分，并且能够确定不同立体角方向的面光源的入射光radiance即可。
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260325112040.png)

### 继续加入其他物体
把其它物体同样考虑成面光源，对其所占立体角进行积分即可，只不过对其它物体的立体角积分不像是面光源所有入射方向都有radiance，物体的立体角可能只有个别几个方向有入射的radiance(即多次物体间光线反射之后恰好照射到着色点，其它方向没有，但本质上都可以视作是面光源。
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260325114006.png)

观察一下图中的渲染方程可以发现除了两个radiance，其它所有项都是知道的，可以将上式进一步写成如下图下方所示的式子：
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260325114443.png)
## 解渲染方程

由于间接光照的存在，使得解渲染方程变成了一个递归的存在，这是非常棘手的问题。下面有两种解渲染方程的方法：

### 线性求解方程化
我们将其转化为下列式子来看待：
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260325114147.png)
其中$L$其实就是想要求得的反射光，$E$是自发光其实就是光源的发光项，$K$可以理解为对光线进行反射的一种算子操作(因为它由BRDF化来的)。那么利用线性代数的知识很容易就可以推导出$L$的结果如下：
$$L=E+KL$$
$$IL-KL=E$$
$$(I-K)L=E$$
$$L=(I-K)^{-1}E$$
其中$I$为单位矩阵，再接着对$(I-K)^{-1}$使用广义二项式定理得到：
$$L=(I+K+K^2+K^3+...)E$$
$$L=E+KE+K^2E+K^3E+...$$
$E$为光源发出的光，$KE$则代表对光源反射一次的结果，即直接光照，那么前两项之和就是光栅化当中着色所考虑的结果，对于全局光照来说，还考虑了$K^2E$，即一次弹射的间接照明，$K^3E$就是两次弹射的间接照明，依次类推。

### 光线追踪+蒙特卡洛方法
### 蒙特卡洛积分
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320173845.png)

### 路径追踪

该方程暂时不考虑自发光项，只考虑直接光照的渲染方程：
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260320173900.png)
