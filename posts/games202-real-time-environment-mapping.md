---
id: games202-real-time-environment-mapping
index: '11'
title_zh: 'Real-Time Environment Mapping'
title_en: 'Real-Time Environment Mapping'
excerpt_zh: '有向距离场（Signed Distance Field，简称 SDF）是一种用函数来描述形状的方式：'
excerpt_en: 'Signed Distance Fields (SDF) describe shapes with functions — notes on real-time environment mapping.'
tags: ['计算机图形学', 'Games系列', '渲染']
date: '2026.02.23'
readTime: '4 min'
---

# SDF

有向距离场（Signed Distance Field，简称 SDF）是一种用函数来描述形状的方式：

$$SDF(p) = \pm \min_{q \in surface} \|p - q\|$$

SDF定义了空间中任意一个点到场景中某个物体的最小距离

![7bb270c5-80c6-4e01-9f11-1e72d359fea4.png](https://imghost.saturnhalo.xyz/rest/1HtUcEk.png)

## 应用1：Ray Marching

利用了SDF中隐含的一个信息，一张SDF中定义了从该地方到其他地方的最小距离，也就相当于告诉我们在这一距离内都不会碰到其他的物体，等效于一个**安全距离**。

因此在我们选择一个点光源的时候，就可以用这个点的SDF计算出此时的光线能去多远，然后在新的点再次拿到一个SDF，以此类推~

不过由于计算SDF，要把每个空间的都算出来，所以需要牺牲很大一部分存储，

在空间中，每个点对每个物体都有自己的一套SDF，在计算光线的时候，选取其最小的那个SDF即可，节省算力。

## 应用2：生成软阴影

我们知道SDF会产生一个安全距离，比如下图中找到一个点往外射出一条光线，任选一个点，该点处会有自己的SDF，能找到与最近的遮挡物体的距离。而从光源处，到这个SDF的极限距离的点，会产生一个角度，被称作为**安全角度**。我们反向思考，如果安全角度越小，意味着这个地方被阴影遮挡的越严重，也就是越暗，因此就可以用这么一套思路来生成软阴影。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260224221725.png)

**安全角度**可以这样生成，在不同的点找到自己的安全角度，最后对比，找到最小的那个即可。参考下图：

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260224222523.png)

通过图中的想法，我们所想出来的计算公式是：
$$\arcsin \frac{\text{SDF}(p)}{p - o}$$
但是涉及到反三角的运算，会大幅度浪费计算机的性能，所以实际上我们使用的是另外一种方法：
$$\min \left\{ \frac{k \cdot \text{SDF}(p)}{p - o}, 1.0 \right\}$$
原因是这里的$\frac{\text{SDF}(p)}{p - o}$本身就能大概表示$\arcsin \frac{\text{SDF}(p)}{p - o}$的一个趋势了，因此直接用里面的这部分，然后给予一个参数$k$用来控制大小。而定义了一个最大的$1.0$，也就是说不会让这个数字超过之前的$\arcsin \frac{\text{SDF}(p)}{p - o}$的最值。
最后会发现，这里的$k$其实就是控制阴影的软硬程度的。

# 环境光照

环境光照就是存储了在空间中，朝向任何方向的颜色

环境光映射是将环境光存储在一个贴图上。因为几乎只有观察方向对环境光起到影响，所以各个方向的光源可以用一个球体进行存储，即任意一个3D方向，都标志着一个纹理上的点，即一个RGB值。

环境光照是指一个着色点沿任意方向无限远的光照。中提到，可以将环境光照信息存储到一张3D贴图上。这张贴图代表了shading point沿任意方向观察的无限远的光照。这张3D贴图可以是球体，也可以是立方体。

$$L_o(p, \omega_o) = \int_{\Omega} L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos\theta_i V(v, \omega_i) d\omega_i$$
![](images/ComputerScience/计算机图形学/Pasted%20image%2020260224231332.png)

结合之前所讲，Visibility部分可以省略了，但是前面这一块一般来说可以使用蒙特卡罗方法，但是这种积分方法需要去大量的采样来收敛到他的目标解，在实时渲染中是无法接受的。

$L_i(p, \omega_i)$：IBL中记录的信息作为接受到的光照信息
$f_r(p, \omega_i, \omega_o)$：BRDF式

BRDF会有glossy和diffuse两种状态，前者的support则比较小，而当他为diffuse时，则会发现很smooth。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260224235021.png)

提到这两个性质，就可以用到我们之前提到的公式了！

$$\int_{\Omega} f(x)g(x) \, \mathrm{d}x \approx \frac{\int_{\Omega} f(x) \, \mathrm{d}x}{\int_{\Omega} \mathrm{d}x} \cdot \int_{\Omega} g(x) \, \mathrm{d}x$$

我们这里的$g(x)$也就是BRDF式，那么提出来的也就是光有关的式子：
$$L_o(p, \omega_o) \approx \underbrace{\left( \frac{\int_{\Omega_{f_r}} L_i(p, \omega_i) d\omega_i}{\int_{\Omega_{f_r}} d\omega_i} \right)}_{\text{第一部分：环境光预过滤}} \cdot \underbrace{\int_{\Omega^+} f_r(p, \omega_i, \omega_o) \cos \theta_i d\omega_i}_{\text{第二部分：材质预计算}}$$
而对于这个式子：$\frac{\int_{\Omega_{f_r}} L_i(p, \omega_i) d\omega_i}{\int_{\Omega_{f_r}} d\omega_i}$，其实就是将IBL这个图变得模糊。

光照的全部信息来自IBL的那张贴图信息，在实时渲染中我们想要将原本的采样多次变成离线预处理实时查询，这种实现类似于 minimap。

我们对光照信息贴图进行模糊化。模糊就是在任何一点上取周围一片范围求出范围内的平均值并将平均值写回这个点上。

滤波的核取多大取决于BRDF占多大，BRDF的区域越大，最后取得的图也就越模糊。相当于材质表面越光滑。

我们将不同滤波核处理环境光信息贴图生成一系列模糊过的图，当我们需要时进行查询即可。如果我们需要的滤波核不存在，也可以通过在这些已生成的通过三线性插值得到。

![](images/ComputerScience/计算机图形学/Pasted%20image%2020260225001140.png)

接下来我们对这里的BRDF式进行分析：
$$f(\mathbf{i}, \mathbf{o}) = \frac{F(\mathbf{i}, \mathbf{h})G(\mathbf{i}, \mathbf{o}, \mathbf{h})D(\mathbf{h})}{4(\mathbf{n}, \mathbf{i})(\mathbf{n}, \mathbf{o})}$$
实时渲染主要关注菲涅尔项$f(\mathbf{i}, \mathbf{o})$和法线分布函数$D(\mathbf{h})$。

用Schlick近似来求得菲涅尔项（这里的$R_0$相当于是个常数）：
$$R(\theta) = R_0 + (1 - R_0)(1 - \cos \theta)^5$$
$$R_0 = \left( \frac{n_1 - n_2}{n_1 + n_2} \right)^2$$

用 Beckmann NDF 来近似法线分布函数：
$$D(h) = \frac{e^{-\tan^2 \theta / \alpha^2}}{\pi \alpha^2 \cos^4 \theta}$$
该BRDF 的积分结果依赖于三个参数：
-Fresnel 项系数
-粗糙度 roughness
-θ （反射方向与法线的夹角）

我们进一步思考：
$$\int_{\Omega^+} f_r(p, \omega_i, \omega_o) \cos \theta_i \text{d}\omega_i \approx R_0 \int_{\Omega^+} \frac{f_r}{F} (1 - (1 - \cos \theta_i)^5) \cos \theta_i \text{d}\omega_i + \int_{\Omega^+} \frac{f_r}{F} (1 - \cos \theta_i)^5 \cos \theta_i \text{d}\omega_i$$

会发现对于相同的材质（相同的BRDF），我们就可以针对剩余两个依赖的参数 粗糙度 、θ 建立一张 二维查询表。

# Shadow from Environment Lighting

实际上这个问题是很难解决的，比如以下给出两个思路用来重新看待该问题，分别视作为**多光源问题**和**采样问题**。

实际上这么看，计算量都会大到一个无法承载的量，所以我们会使用其他的解决方案。

在工业界：只使用场景中最亮的光源来进行这件事（或者两三个），比如太阳。

这里可以看一下傅里叶变换的内容：Games202-19:30-

**时域上的卷积等于频域上的乘积**

$$\int_{\Omega} f(x) g(x) \, \mathrm{d}x$$

对于任意的product integral(两个函数先乘积在积分),我们将其认为是做了一个卷积操作,理解为spatial域上的两个信号f(x)和g(x)进行一个卷积,等于在频域上让两个信号相乘,如果两个信号有一个信号是低频的,那么频域上相乘后得到的结果也是低频的,最终相乘在积分的结果也是低频的,可以总结为：**积分之后的频率取决于积分前最低的频率**

$$f(x) = \sum_{i} c_i \cdot B_i(x)$$
把一个函数可以描绘成其他函数的线性组合,如f(x)可以描绘成一系列的Bi函数乘以各自对应的系数最终再相加在一起,这一系列的函数Bi就是基函数.

回归正题,我们要讨论的是如何在环境光照下生成阴影,先从最简单的开始,如果给了你环境光和一个diffuse的物体,在不考虑Shadow的情况下如何去计算shading值?

为了计算shading值,我们引入数学工具：**Spherical Harmonics(球谐函数)**

太难了，不想学了，以后再回来看（如果谁看到这篇博客请提醒我）
[(13 封私信 / 2 条消息) Games202 高质量实时渲染笔记lecture 06 Real-Time Environment Mapping 02 - 知乎](https://zhuanlan.zhihu.com/p/373697912)
