PBR就是基于物理的渲染，一套基于物理公式的渲染流程。其实就是在模拟现实中光如何运动。这里我主要是在复刻BRDF流程

最终物体体现出来的颜色就是物体所反射出来的光的颜色，主源包括 ==主光源== 和 ==环境光==

>两个光源的作用
>主光源：物体产生高光和进行阴影投射
>环境光：照亮暗部 防止死黑（对金属尤为重要）

# BRDF（双向反射分布函数）概述

$$
f_r(\mathbf{l},\mathbf{v}) = K_d \, f_d(\mathbf{l},\mathbf{v}) + K_s \, f_s(\mathbf{l},\mathbf{v})
$$

$$
L_o =
\int_{\Omega^+}
\left(
K_d \frac{c_d}{\pi}
+
K_s \frac{D F G}{4(\mathbf{n}\cdot\mathbf{l})(\mathbf{n}\cdot\mathbf{v})}
\right)
L_i(\mathbf{l})(\mathbf{n}\cdot\mathbf{l}) \, d\omega
$$

描述的是 光从光源打到物体表面再到眼睛的映射过程

BRDF主要分为两个部分 ==漫反射== 和 ==镜面反射== 主要遵循两个重要理论 ==微表面理论== 和 ==能量守恒==

公式中我们可以看到主要是有两项，我们用Kd项和Ks项代称，Kd项是漫反射项，Ks项是镜面反射项。这两个参数是漫反射参数和镜面反射参数，他们两就是在描述能量的分配 $K_d + K_s \le 1$

这个公式的输入有 
l：光照方向 
v：视线方向 
h：半角方向(l + v)

>两个反射
>- 漫反射：描述的是物体光打到物体表面进入物体内部再出来的部分
>- 镜面反射：描述的是光打在物体表面从物体直接反射出去的部分

>两个理论
>- 微表面理论：描述的是物体的粗糙度 一个非常微观的概念。其实就是高中物理中描述摩擦力的粗糙度。举个例子，一个像素，在游戏中是及其小的单元了吧，但其实一个像素中有着成千上万的法线去描述这块面积的粗糙度。当然实际计算并不会真正的使用这些法线，而是通过统计学的规律去计算
>- 能量守恒：描述的其实主要是亮度，一束光到达眼睛的亮度不会高于它射出的亮度。其实就是在说光在到眼睛的路上进行了能量分配，分配给了漫反射和镜面反射（当然也有一些打到了别的物体上不进入眼睛）

接下来会一一介绍光在进入眼睛时会走过哪些路并影响它的分配

# 物体材质

物体材质是是物体本身的性质，当光打到物体上的时候，物体材质会决定能量怎么分配，哪些光进入物体哪些反射出去。而描述物体材质的参数就是F0（垂直入射时的菲涅尔反射率）。而引擎中，物体最低的F0是0.04

>F0：由物体材质决定的，同时会影响菲涅尔参数。

# 菲涅尔项（F项）
$$
F(\mathbf{v},\mathbf{h}) =
F_0 + (1 - F_0)(1 - \mathbf{v}\cdot\mathbf{h})^5
$$

```HLSL
float3 FresnelSchlick(float cosTheta, float3 F0)  
{  
    return F0 + (1 - F0) * pow(max(0.0, 1.0 - cosTheta), 5.0);  
}
```

菲涅尔效应讲的是光打到物体表面会因为角度不同而影响光进入或反射出物体的比例。比如当光以相对法线90度入射（掠射角）的时候，亮度就全以反射的形式出去了（严格来说不是，但我们考虑极限情况来这么理解）

这里有一个非常关键的东西就是 菲涅尔参数在工程上一般就是我们的 Ks 原因在于菲涅尔参数就是在描述反射率

所以有
```HLSL
float3 kS = F;  
float3 kD = (1.0 - kS) * (1.0 - metallic.r);//金属度贴图的r通道存的就是金属度
```

# 几何项 (G项)
$$
G(l,v) = G(l)\,G(v)
$$

$$
k = \frac{(r + 1)^2}{8}
$$

$$
G(x) =
\frac{n \cdot x}{
(n \cdot x)(1 - k) + k
}
$$


```HLSL
float GeometrySchlickGGX(float cosTheta, float k)  
{  
    float nom = cosTheta;  
    float denom = cosTheta * (1.0 - k) + k;  
    return nom / max(denom, 0.00001);  
}  
  
float GeometrySmith(float NdotV, float NdotL, float roughness)  
{  
    float r = (roughness + 1.0);  
    float k = (r * r) / 8.0;
    float ggx2 = GeometrySchlickGGX(NdotV, k);  
    float ggx1 = GeometrySchlickGGX(NdotL, k);  
  
    return ggx1 * ggx2;  
}
```

几何项就是微表面理论的体现，它描述的是物体表面的微小疙瘩对光线的遮挡，当光入射的时候，光会被这些微小疙瘩遮挡即$G(l)$，出射时也会被遮挡即$G(v)$，所以这一项就是在描述遮挡程度的(通过统计学公式)

# 法线分布项 （D项）

$$
\alpha = roughness^2
$$

$$
D_{GGX} =
\frac{\alpha^2}
{
\pi\left[(\mathbf{n}\cdot\mathbf{h})^2(\alpha^2 - 1) + 1\right]^2
}
$$

```HLSL
float DistributionGGX(float NdotH, float roughness)  
{  
    float a = roughness * roughness;  
    float a2 = a * a;  
    float d = (NdotH * NdotH) * (a2 - 1.0) + 1.0;      
    float denom = PI * d * d;  
  
    return a2 / max(denom, 0.00001);  
}
```
我们知道当一束光射入的时候，会有一个固定的出射角，当沿着这个出射角观察的时候，光的能量是最多的也就是最亮的（这是基础的Phong模型）。我们现在要理解我们的D项，它也是和入射角度相关，但我们现在要进入微观层面，一个像素有成千上万的微小表面，而当这个微小表面的光通过反射进入到我们眼中它就是亮的，否则就是暗的（暗不代表没有光，只是我们无法捕获），然后我们通过一个统计学公式可以计算在某个角度下，这个像素有多少微小表面的反射光能进入我们的眼睛，也就决定了它的亮度。

>PS：当粗糙度高的时候，高光更暗，高光更散（范围更广），我的理解是粗糙度干扰了法线分布，使原本的高亮法线的值变低，同时使一些本来不亮的法线进入到亮的行列（这是法线分布公式的实现，主要是基于统计学）

# 漫反射
$$
f_d(\mathbf{l},\mathbf{v}) = \frac{c_d}{\pi}
$$
```HLSL
float3 directDiffuse = albedo / PI;
```
漫反射的理论比较简单，它说的是进入物体内部的光会在内部反射最后出来，最后表现为在物体表面均匀的散射出来

# 光照衰减
描述的是光在传播过程中会发生衰减，就是说光会随到物体的距离衰减

# 环境光
环境光采样这块，主要是一个概述
利用球谐函数计算环境光
然后利用视线方向求出反射方向 然后去采样
这是一个采样贴图的过程，而物体本身的粗糙度会影响反射的质量，所以通过粗糙度选择mip并以这个mip层去采样

# LUT
还没看~

# 源码
```HLSL
Shader "Custom/PBR"
{
    Properties
    {
       [MainTexture] _AlbedoMap("Albedo Tex", 2D) = "white"{}
       [MainColor] _BaseColor("Base Color", Color) = (1, 1, 1, 1)
        
       _NormalMap ("Normal Map", 2D) = "bump"{}
       _NormalScale ("Normal Scale", float) = 1.0
        
       _MetallicGlossMap ("Metallic", 2D) = "white"{}
       
       _Smoothness ("Smoothness", Range(0.0, 1)) = 0.5
        
       _OcclusionMap ("Occlusion", 2D) = "white"{}
        
       [HDR] _EmissionColor("Emission Color", Color) = (0, 0, 0)
       _EmissionMap("Emission Map", 2D) = "white"{}
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline"}

        Pass
        {
            Name "ForwardLit"
            Tags {"LightMode" = "UniversalForward"}
            
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            // 宏定义
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile _ _SHADOWS_SOFT
            
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
                float _Smoothness;
                float4 _EmissionColor;
                float _NormalScale;
            CBUFFER_END

            TEXTURE2D(_AlbedoMap);     SAMPLER(sampler_AlbedoMap);
            TEXTURE2D(_NormalMap);     SAMPLER(sampler_NormalMap);
            TEXTURE2D(_MetallicGlossMap);     SAMPLER(sampler_MetallicGlossMap);
            TEXTURE2D(_OcclusionMap);     SAMPLER(sampler_OcclusionMap);
            TEXTURE2D(_EmissionMap);     SAMPLER(sampler_EmissionMap);

            #define PI 3.14159265359
            #define F_CONST float3(0.04, 0.04, 0.04)

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
                float3 normalOS : NORMAL;
                float4 tangentOS : TANGENT;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD4;
                float2 uv : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float3 tangentWS : TEXCOORD2;
                float3 bitangentWS : TEXCOORD3;
            };
            
            Varyings vert(Attributes input)
            {
                Varyings output = (Varyings)0;
                VertexPositionInputs vertexInput = GetVertexPositionInputs(input.positionOS);
                VertexNormalInputs normalInput = GetVertexNormalInputs(input.normalOS, input.tangentOS);

                output.positionCS = vertexInput.positionCS;
                output.positionWS = vertexInput.positionWS;
                output.normalWS = normalInput.normalWS;
                output.tangentWS = normalInput.tangentWS;
                output.bitangentWS = normalInput.bitangentWS;

                output.uv = input.uv;
                return output;
            }

            float3 FresnelSchlick(float cosTheta, float3 F0)
            {
                return F0 + (1 - F0) * pow(max(0.0, 1.0 - cosTheta), 5.0);
            }

            // --- GGX 分布函数 ---
            float DistributionGGX(float NdotH, float roughness)
            {
                float a = roughness * roughness;
                float a2 = a * a;
                
                float d = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
                float denom = PI * d * d;

                return a2 / max(denom, 0.00001);
            }

            float GeometrySchlickGGX(float cosTheta, float k)
            {
                float nom = cosTheta;
                float denom = cosTheta * (1.0 - k) + k;
                return nom / max(denom, 0.00001);
            }

            float GeometrySmith(float NdotV, float NdotL, float roughness)
            {
                float r = (roughness + 1.0);
                float k = (r * r) / 8.0; // 直接光照的 k 值计算
                float ggx2 = GeometrySchlickGGX(NdotV, k);
                float ggx1 = GeometrySchlickGGX(NdotL, k);

                return ggx1 * ggx2;
            }
            
            half4 frag(Varyings input) : SV_Target
            {
                // 1. 获取阴影坐标
                float4 shadowCoord = TransformWorldToShadowCoord(input.positionWS);
                
                // 2. 获取主光源（包含阴影衰减）
                Light light = GetMainLight(shadowCoord);
                
                float3 L = normalize(light.direction);
                float3 V = normalize(GetCameraPositionWS() - input.positionWS);
                float3 H = normalize(L + V);
                
                float3x3 TBN = float3x3(normalize(input.tangentWS), normalize(input.bitangentWS), normalize(input.normalWS));
                float roughness = 1.0 - _Smoothness;
                
                // 采样
                float4 albedoSample = SAMPLE_TEXTURE2D(_AlbedoMap, sampler_AlbedoMap, input.uv);
                float3 albedo = albedoSample.rgb * _BaseColor.rgb; // 乘上 BaseColor
                float3 emission = SAMPLE_TEXTURE2D(_EmissionMap, sampler_EmissionMap, input.uv).rgb;
                float3 occlusion = SAMPLE_TEXTURE2D(_OcclusionMap, sampler_OcclusionMap, input.uv).rgb;
                float3 metallic  = SAMPLE_TEXTURE2D(_MetallicGlossMap, sampler_MetallicGlossMap, input.uv).rgb;
                
                // --- 修复点 2: 应用 Normal Scale ---
                // 使用 UnpackNormalScale 而不是 UnpackNormal
                float3 normalTS = UnpackNormalScale(SAMPLE_TEXTURE2D(_NormalMap, sampler_NormalMap, input.uv), _NormalScale);
                float3 N = normalize(mul(normalTS, TBN));

                // 角度计算
                float NdotH = saturate(dot(N, H));
                float NdotL = saturate(dot(N, L));
                float NdotV = saturate(dot(N, V)); // 加上 max 保护防止除零通常更好，但 saturate 也行
                float HdotV = saturate(dot(H, V));
                
                // ----- 直接光 -----
                float3 directDiffuse = albedo / PI; 
                
                float3 F0 = lerp(F_CONST, albedo, metallic.r);
                float D = DistributionGGX(NdotH, roughness);
                float G = GeometrySmith(NdotV, NdotL, roughness);
                float3 F = FresnelSchlick(HdotV, F0);
                
                float3 nominator = D * G * F;
                float denominator = 4.0 * NdotV * NdotL;
                float3 directSpecular = nominator / max(denominator, 0.00001);

                float3 kS = F;
                float3 kD = (1.0 - kS) * (1.0 - metallic.r);

                // 加上光照衰减 (light.distanceAttenuation * light.shadowAttenuation)
                // NdotL 必须乘进去，这是 Lambert 定律
                float3 directColor = (kD * directDiffuse + directSpecular) * light.color * NdotL * (light.distanceAttenuation * light.shadowAttenuation);
                
                // ----- 环境光 (IBL) -----
                float3 indirectDiffuse = SampleSH(N); // URP SampleSH 已经包含了光照强度
                float3 reflectDir = reflect(-V, N);
                float mip = PerceptualRoughnessToMipmapLevel(roughness);
                float4 encodedIrradiance = SAMPLE_TEXTURECUBE_LOD(unity_SpecCube0, samplerunity_SpecCube0, reflectDir, mip);
                float3 indirectSpecular = DecodeHDREnvironment(encodedIrradiance, unity_SpecCube0_HDR);//解码 HDR
                
                indirectDiffuse *= occlusion.r;
                indirectSpecular *= occlusion.r;
                
                // IBL 的菲涅尔修正
                float3 F_indirect = FresnelSchlick(max(dot(N, V), 0.0), F0);
                float3 indirectColor = indirectDiffuse * kD * albedo + indirectSpecular * F_indirect; // 这里通常不需要再乘 PI

                // Emission
                float3 emissionColor = emission * _EmissionColor.rgb;
                
                float3 finalColor = directColor + indirectColor + emissionColor;
                //float3 finalColor = directColor;
                //float3 finalColor = indirectColor;
                //float3 finalColor = directColor + indirectColor;
                return float4(finalColor, 1.0);
            }
	        ENDHLSL
        } 
    }
}

    
    
    
```

