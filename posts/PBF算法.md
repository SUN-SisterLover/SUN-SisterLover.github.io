---
id: pbf-algorithm
index: '50'
title_zh: 'PBF算法'
excerpt_zh: 'PBF 把 PBD 的"位置约束投影"思想搬到流体模拟上：把每个水分子看成一个粒子，不再算压力和速度积分，而是直接要求每个粒子周围的密度保持恒定，违反了就改位置'
tags: ['PBF', 'Fluids', '密度', '基于密度的算法']
date: '2026.09.08'
readTime: '3 min'
---

# PBF（Position Based Fluids）算法

## 简介

**PBF** 把 PBD 的"位置约束投影"思想搬到流体模拟上：把每个水分子看成一个粒子，不再算压力和速度积分，而是直接要求**每个粒子周围的密度保持恒定**，违反了就改位置。

---

## 前置知识：SPH 与核函数

核函数：

$$
W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

其中：

- $\mathbf{p}_i - \mathbf{p}_j$：两个粒子的相对位置
- $h$：影响半径
- $W$：粒子 $j$ 对位置 $i$ 的密度贡献

所以粒子 $i$ 附近的密度估计为：

$$
\rho_i = \sum_j m_j W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

邻居越多、距离越近，$\rho_i$ 就越大。

定义相对位置：

$$
\mathbf{r}_{ij} = \mathbf{p}_i - \mathbf{p}_j
$$

核函数记作：

$$
W_{ij} = W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

对中心粒子 $i$ 求导：

$$
\nabla_{\mathbf{p}_i} W(\mathbf{p}_i - \mathbf{p}_j, h) = \nabla W(\mathbf{r}_{ij}, h)
$$

因为：

$$
\frac{\partial (\mathbf{p}_i - \mathbf{p}_j)}{\partial \mathbf{p}_i} = I
$$

而对邻居 $j$ 求导：

$$
\nabla_{\mathbf{p}_j} W(\mathbf{p}_i - \mathbf{p}_j, h) = -\nabla W(\mathbf{r}_{ij}, h)
$$

因为：

$$
\frac{\partial (\mathbf{p}_i - \mathbf{p}_j)}{\partial \mathbf{p}_j} = -I
$$

所以最关键的关系是：

$$
\boxed{\nabla_{\mathbf{p}_j} W_{ij} = -\nabla_{\mathbf{p}_i} W_{ij}}
$$

直觉上也很好理解：把 $i$ 向右移动，和把 $j$ 向左移动，都会改变两者间的相对位置，但效果相反，所以两个梯度方向相反。

---

## 强制不可压缩性约束

我们应该如何让每个分子知道自己应该朝哪个方向运动？如何让计算出来的运动更加符合现实世界的物理规律？既要体现 **Realism**，又要满足实时渲染的需求，经典的强制不可压缩性（Enforcing Incompressibility）约束条件就出来了。约束条件是这样描述的：

对于第 $i$ 个水分子小球，我们定义 $C_i$ 为它的约束：

$$
C_i(p_1, \cdots, p_n) = \frac{\rho_i}{\rho_0} - 1
$$

> 📝 笔记：这里的 $-1$ 我感觉应该是表示正负性的，主要是这样判断起来方便——$C_i = 0$ 就是密度刚刚好。我们要做的其实就是让密度总能够返回到 $\rho_0$，相当于 $C_i = 0$。

其中 $\rho_0$ 是用户可以自己调节的标准"密度"参数，而 $\rho_i$ 的计算公式如下：

$$
\rho_i = \sum_j m_j W_{poly6}(\mathbf{p}_i - \mathbf{p}_j, h)
$$

> 💡 通常情况下认为各个粒子质量相同，后面的计算公式中省略质量项。其中 $W_{poly6}$ 和 $W_{spiky}$ 是**核函数**。

> 💡 **强制不可压缩性**：现实中的水几乎是不可压缩的。在粒子模拟里，粒子只受重力、碰撞这些外力驱动，没有任何东西阻止它们越挤越密，因此强行规定"每个粒子周围的密度必须保持恒定"，不允许被压缩（也不允许稀疏）。

---

## 约束求解：求 $\Delta\mathbf{p}$

### 目标

我们设定的约束条件如下——位置修正 $\Delta\mathbf{p}_i$ 之后，约束要被满足：

$$
C_i(\mathbf{p}_i + \Delta\mathbf{p}_i) = 0
$$

即"挪到新位置后，密度偏差归零"。接下来的任务就是求解这个 $\Delta\mathbf{p}_i$。

### 梯度的逐粒子分解

粒子 $i$ 的密度约束是：

$$
C_i = \frac{\rho_i}{\rho_0} - 1
$$

密度为：

$$
\rho_i = \sum_{j \in \mathcal{N}_i} m_j W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

代入得到：

$$
C_i = \frac{1}{\rho_0} \sum_{j \in \mathcal{N}_i} m_j W(\mathbf{p}_i - \mathbf{p}_j, h) - 1
$$

可以看到，$C_i$ 依赖：

- 中心粒子的位置 $\mathbf{p}_i$
- 每个邻居的位置 $\mathbf{p}_j$

因此我们需要分别求 $\nabla_{\mathbf{p}_i} C_i$，以及任意一个邻居 $k$ 的 $\nabla_{\mathbf{p}_k} C_i$。

**对 $\mathbf{p}_i$ 求导**

微分可以进入求和：

$$
\boxed{\nabla_{\mathbf{p}_i} C_i = \frac{1}{\rho_0} \sum_j m_j \nabla_{\mathbf{p}_i} W(\mathbf{p}_i - \mathbf{p}_j, h)}
$$

**对邻居 $\mathbf{p}_k$ 求导**

假设只移动一个特定邻居 $k$。密度求和中只有一项包含 $\mathbf{p}_k$：

$$
m_k W(\mathbf{p}_i - \mathbf{p}_k, h)
$$

其他项都与 $\mathbf{p}_k$ 无关，求导为零。因此：

$$
\nabla_{\mathbf{p}_k} C_i = \frac{m_k}{\rho_0} \nabla_{\mathbf{p}_k} W(\mathbf{p}_i - \mathbf{p}_k, h)
$$

利用前面的正负关系：

$$
\nabla_{\mathbf{p}_k} W(\mathbf{p}_i - \mathbf{p}_k, h) = -\nabla_{\mathbf{p}_i} W(\mathbf{p}_i - \mathbf{p}_k, h)
$$

所以：

$$
\boxed{\nabla_{\mathbf{p}_k} C_i = -\frac{m_k}{\rho_0} \nabla_{\mathbf{p}_i} W(\mathbf{p}_i - \mathbf{p}_k, h)}
$$

统一省略质量项，最后总结：

$$
\nabla_{p_k} C_i = \frac{1}{\rho_0}
\begin{cases}
\sum_j \nabla_{p_k} W_{Spiky}(\mathbf{p}_i - \mathbf{p}_j, h) & k = i \\
-\nabla_{p_k} W_{Spiky}(\mathbf{p}_i - \mathbf{p}_j, h) & k = j
\end{cases}
$$

> 💡 $\nabla_{p_k} C_i$ 表示：稍微移动粒子 $k$，粒子 $i$ 的密度约束变化最快的方向和变化率。

> 💡 **为什么用两个核函数？** 常见实现中：
>
> - 使用 $W_{poly6}$ 估计密度
> - 使用 $\nabla W_{spiky}$ 计算压力方向
>
> 这并非数学推导要求必须使用两个不同的核，而是数值上的选择：
>
> - Poly6 比较平滑，适合估计密度
> - Spiky 的梯度在粒子接近时表现更好，适合产生排斥修正
> - Poly6 在非常靠近中心时梯度趋近于零，重叠粒子可能难以分开
>
> 因此它们分别承担"测量拥挤程度"和"决定推开方向"的工作。

### 从 PBD 继承的 $\lambda$ 公式

在 PBD 中我们推导过（一阶泰勒展开），最后的结果如下：

$$
\lambda = -\frac{C(\mathbf{p})}{|\nabla_{\mathbf{p}} C|^2}
$$

回到 PBF：约束 $C_i$ 是所有相关粒子位置的多元函数：

$$
C_i(\mathbf{p}_1, \mathbf{p}_2, \ldots, \mathbf{p}_N) = \frac{\rho_i}{\rho_0} - 1
$$

给所有相关粒子的位置一个修正：

$$
\mathbf{p}_k^{new} = \mathbf{p}_k + \Delta\mathbf{p}_k
$$

对 $C_i$ 做多变量一阶泰勒展开：

$$
C_i(\mathbf{p}_1 + \Delta\mathbf{p}_1, \ldots) \approx C_i + \sum_k \nabla_{\mathbf{p}_k} C_i \cdot \Delta\mathbf{p}_k
$$

要求修正后约束为零：

$$
C_i + \sum_k \nabla_{\mathbf{p}_k} C_i \cdot \Delta\mathbf{p}_k = 0
$$

PBD 规定由约束 $C_i$ 引起的位置修正为（这是一个定义，翻译过来就是位置修正=修正大小×修正方向）：

$$
\boxed{\Delta\mathbf{p}_k = \lambda_i \nabla_{\mathbf{p}_k} C_i}
$$

- $C_i$：第 $i$ 个约束；
- $\mathbf{p}_k$：受到该约束影响的第 $k$ 个粒子；
- $\Delta\mathbf{p}_k$：准备给粒子 $k$ 的位置修正；
- $\nabla_{\mathbf{p}_k}C_i$：移动粒子 $k$ 时，哪个方向能最快改变约束 $C_i$；
- $\lambda_i$：沿这个方向移动多远。

将它代入泰勒展开：

$$
C_i + \sum_k \nabla_{\mathbf{p}_k} C_i \cdot \left( \lambda_i \nabla_{\mathbf{p}_k} C_i \right) = 0
$$

整理得到 $\lambda_i$ 的解：

$$
\lambda_i = -\frac{C_i}{\sum_k |\nabla_{p_k} C_i|^2}
$$

> 📝 PBF 中，约束 $C_i$ 同时依赖粒子 $i$ 和所有邻居的位置，因此分母必须统计所有相关粒子的梯度。这里的 $k$ 包括：
>
> - $k = i$：移动中心粒子自己
> - $k = j$：移动任意邻居
> - 其他不相关粒子的梯度为零，不用计算

### 代回得到最终位移

> 📝 笔记：最终的贡献需要 $\lambda_i + \lambda_j$，因为假设 $i$ 和 $j$ 粒子相邻，它们的位置关系会同时影响到两个约束 $C_i$ 和 $C_j$。

把 $\nabla_{p_k} C$ 代回修正量 $\Delta\mathbf{p}_i$（$i$ 自己的约束贡献一项，所有邻居 $j$ 的约束各贡献一项）。注意第二项是 $\lambda_j \nabla_{\mathbf{p}_i} C_j$——求的是粒子 $i$ 的位移，所有梯度都对 $\mathbf{p}_i$ 求导。第二步代入梯度公式：$\nabla_{p_i} C_j$ 只含 $k = i$ 那一项，即 $-\frac{1}{\rho_0} \nabla_{p_i} W(\mathbf{p}_j - \mathbf{p}_i)$；第三步利用核函数的对称性 $W(\mathbf{p}_j - \mathbf{p}_i) = W(\mathbf{p}_i - \mathbf{p}_j)$，而对 $\mathbf{p}_i$ 求导差一个负号，即 $\nabla_{p_i} W(\mathbf{p}_j - \mathbf{p}_i) = -\nabla_{p_i} W(\mathbf{p}_i - \mathbf{p}_j)$，最后合并同类项：

$$
\begin{aligned}
\Delta \mathbf{p}_i
&\approx \lambda_i \nabla_{p_i} C_i + \sum_{j \neq i} \lambda_j \nabla_{p_i} C_j \\
&\approx \frac{1}{\rho_0} \sum_{j \neq i} \lambda_i \nabla_{p_i} W_{Spiky}(\mathbf{p}_i - \mathbf{p}_j, h) - \frac{1}{\rho_0} \sum_{j \neq i} \lambda_j \nabla_{p_i} W_{Spiky}(\mathbf{p}_j - \mathbf{p}_i, h) \\
&\approx \frac{1}{\rho_0} \sum_{j \neq i} \lambda_i \nabla_{p_i} W_{Spiky}(\mathbf{p}_i - \mathbf{p}_j, h) + \frac{1}{\rho_0} \sum_{j \neq i} \lambda_j \nabla_{p_i} W_{Spiky}(\mathbf{p}_i - \mathbf{p}_j, h) \\
&\approx \frac{1}{\rho_0} \sum_{j \neq i} (\lambda_i + \lambda_j) \nabla_{p_i} W_{Spiky}(\mathbf{p}_i - \mathbf{p}_j, h)
\end{aligned}
$$

最终每个粒子的位移只跟一个求和有关：自己和邻居的 $\lambda$ 加起来，乘上核函数梯度。

---

## 算法流程

PBF 随后重复若干次：

1. 搜索每个粒子的邻居
2. 估计每个粒子周围的密度
3. 计算密度约束 $C_i$
4. 计算约束乘子 $\lambda_i$
5. 根据所有相邻粒子的 $\lambda$ 修正位置

最后通过位置变化重建速度（和 PBD 一样的速度反推）：

$$
v_i = \frac{\mathbf{p}_i^{new} - \mathbf{p}_i^{old}}{\Delta t}
$$
