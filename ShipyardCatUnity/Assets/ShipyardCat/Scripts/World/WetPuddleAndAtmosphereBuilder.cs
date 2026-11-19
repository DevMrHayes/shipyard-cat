using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ShipyardCat.World
{
    public static class WetPuddleAndAtmosphereBuilder
    {
        private struct PuddleSpec
        {
            public readonly float X;
            public readonly float Z;
            public readonly float ScaleX;
            public readonly float ScaleZ;
            public readonly float RotationY;

            public PuddleSpec(float x, float z, float scaleX, float scaleZ, float rotationY)
            {
                X = x;
                Z = z;
                ScaleX = scaleX;
                ScaleZ = scaleZ;
                RotationY = rotationY;
            }
        }

        private static readonly PuddleSpec[] PuddleSpecs =
        {
            // Around Alba's spawn (-10, -20) - spaced non-overlapping puddles
            new PuddleSpec(-10.8f, -15.5f, 3.4f, 2.2f, 18f),
            new PuddleSpec(-5.5f, -21.8f, 3.8f, 2.5f, 64f),
            new PuddleSpec(-15.5f, -23.0f, 3.0f, 2.0f, 112f),
            new PuddleSpec(-6.0f, -11.0f, 2.8f, 2.0f, 145f),
            new PuddleSpec(-14.5f, -18.0f, 3.1f, 2.1f, 37f),

            // Around rail yard (-25, 10) - spaced non-overlapping puddles
            new PuddleSpec(-25.4f, 9.5f, 4.4f, 2.8f, 12f),
            new PuddleSpec(-19.5f, 15.0f, 3.6f, 2.4f, 78f),
            new PuddleSpec(-29.5f, 3.5f, 4.0f, 2.6f, 134f),
            new PuddleSpec(-22.0f, -1.5f, 3.2f, 2.2f, 49f),
            new PuddleSpec(-26.5f, 19.0f, 3.5f, 2.4f, 162f),

            // Around Dry Dock 1 east apron (-18, 25..40) - spaced non-overlapping puddles
            new PuddleSpec(-14.5f, 24.0f, 4.0f, 2.7f, 26f),
            new PuddleSpec(-21.5f, 32.0f, 3.6f, 2.5f, 95f),
            new PuddleSpec(-14.0f, 40.0f, 3.8f, 2.6f, 148f),
            new PuddleSpec(-21.0f, 46.5f, 3.2f, 2.1f, 57f),

            // Around Gate 4 (6, -44) - spaced non-overlapping puddles
            new PuddleSpec(2.5f, -40.0f, 3.8f, 2.5f, 31f),
            new PuddleSpec(11.0f, -44.5f, 3.5f, 2.3f, 84f),
            new PuddleSpec(1.0f, -47.5f, 3.2f, 2.2f, 129f),
            new PuddleSpec(9.5f, -37.5f, 3.4f, 2.3f, 168f)
        };

        private static readonly Vector2[] PolePositions =
        {
            new Vector2(-26f, -25f),
            new Vector2(-27.2f, -6.5f),
            new Vector2(8f, -25f),
            new Vector2(8f, 25f),
            new Vector2(-65f, 45f),
            new Vector2(26f, -5f)
        };

        public static void BuildAtmosphereAndPuddles(Transform worldRoot, List<Light> floodlights)
        {
            BuildAtmosphereAndPuddles(worldRoot, floodlights, null, null);
        }

        public static void BuildAtmosphereAndPuddles(
            Transform worldRoot,
            List<Light> floodlights,
            Material organicPuddleMat,
            Material haloMat)
        {
            GameObject container = new GameObject("WetPuddlesAndSodiumAtmosphere");
            if (worldRoot != null)
            {
                container.transform.SetParent(worldRoot, false);
            }

            Material puddleMaterial = organicPuddleMat != null ? organicPuddleMat : CreateWetPuddleMaterial();
            Material darkSteelMaterial = CreateDarkSteelMaterial();
            Material sodiumEmissiveMaterial = CreateSodiumEmissiveMaterial();

            BuildPuddles(container.transform, puddleMaterial);
            BuildSodiumVaporLightPoles(container.transform, darkSteelMaterial, sodiumEmissiveMaterial, haloMat, floodlights);
            BuildYardReflectionProbe(container.transform);
        }

        private static void BuildPuddles(Transform parent, Material puddleMaterial)
        {
            GameObject puddlesRoot = new GameObject("WetPuddles");
            puddlesRoot.transform.SetParent(parent, false);

            for (int i = 0; i < PuddleSpecs.Length; i++)
            {
                PuddleSpec spec = PuddleSpecs[i];
                GameObject puddle = GameObject.CreatePrimitive(PrimitiveType.Quad);
                puddle.name = $"WetPuddle_{i + 1:00}";
                puddle.transform.SetParent(puddlesRoot.transform, false);
                puddle.transform.localPosition = new Vector3(spec.X, 0.034f, spec.Z);
                // Quad front (-Z) rotated +90 deg around X points strictly upward (+Y) to reflect twilight sky
                puddle.transform.localRotation = Quaternion.Euler(90f, spec.RotationY, 0f);
                puddle.transform.localScale = new Vector3(spec.ScaleX * 1.25f, spec.ScaleZ * 1.25f, 1f);

                DestroyColliderImmediateOrRuntime(puddle);

                MeshRenderer renderer = puddle.GetComponent<MeshRenderer>();
                if (renderer != null)
                {
                    renderer.sharedMaterial = puddleMaterial;
                    renderer.shadowCastingMode = ShadowCastingMode.Off;
                    renderer.receiveShadows = true;
                }
            }
        }

        private static void BuildYardReflectionProbe(Transform parent)
        {
            GameObject probeGo = new GameObject("Yard_ReflectionProbe");
            probeGo.transform.SetParent(parent, false);
            probeGo.transform.localPosition = new Vector3(-45f, 6f, 25f);

            ReflectionProbe probe = probeGo.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Baked;
            probe.refreshMode = ReflectionProbeRefreshMode.OnAwake;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.AllFacesAtOnce;
            probe.resolution = 128;
            probe.size = new Vector3(180f, 45f, 240f);
            probe.clearFlags = ReflectionProbeClearFlags.Skybox;
            // Disabled at runtime so WebGL headless/browser renders use the bright evening_sky_1k.hdr skybox IBL instead of an unbaked black cubemap
            probe.enabled = false;
        }

        private static void BuildSodiumVaporLightPoles(
            Transform parent,
            Material darkSteelMaterial,
            Material sodiumEmissiveMaterial,
            Material haloMat,
            List<Light> floodlights)
        {
            GameObject polesRoot = new GameObject("SodiumVaporLightPoles");
            polesRoot.transform.SetParent(parent, false);

            Color sodiumColor = new Color(1f, 0.60784316f, 0.21960784f, 1f); // #FF9B38

            for (int i = 0; i < PolePositions.Length; i++)
            {
                Vector2 pos = PolePositions[i];
                GameObject poleRoot = new GameObject($"SodiumVaporPole_{i + 1:00}");
                poleRoot.transform.SetParent(polesRoot.transform, false);
                poleRoot.transform.localPosition = new Vector3(pos.x, 0f, pos.y);

                // Orient mast arm generally toward yard center
                Vector3 toCenter = new Vector3(-pos.x, 0f, -pos.y);
                if (toCenter.sqrMagnitude > 0.01f)
                {
                    poleRoot.transform.localRotation = Quaternion.LookRotation(toCenter.normalized, Vector3.up);
                }

                // Base plinth (0.45m high)
                GameObject plinth = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                plinth.name = "PolePlinth";
                plinth.transform.SetParent(poleRoot.transform, false);
                plinth.transform.localPosition = new Vector3(0f, 0.225f, 0f);
                plinth.transform.localScale = new Vector3(0.42f, 0.225f, 0.42f);
                ApplyMaterial(plinth, darkSteelMaterial, ShadowCastingMode.On);

                // Main 11m dark steel mast (Cylinder primitive height is 2m, so scale Y = 5.5f => 11m)
                GameObject mast = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                mast.name = "SteelMast";
                mast.transform.SetParent(poleRoot.transform, false);
                mast.transform.localPosition = new Vector3(0f, 5.5f, 0f);
                mast.transform.localScale = new Vector3(0.22f, 5.5f, 0.22f);
                ApplyMaterial(mast, darkSteelMaterial, ShadowCastingMode.On);

                // Cantilever mast arm at 10.88m
                GameObject arm = GameObject.CreatePrimitive(PrimitiveType.Cube);
                arm.name = "MastArm";
                arm.transform.SetParent(poleRoot.transform, false);
                arm.transform.localPosition = new Vector3(0f, 10.88f, 0.72f);
                arm.transform.localRotation = Quaternion.Euler(-8f, 0f, 0f);
                arm.transform.localScale = new Vector3(0.14f, 0.14f, 1.55f);
                DestroyColliderImmediateOrRuntime(arm);
                ApplyMaterial(arm, darkSteelMaterial, ShadowCastingMode.Off);

                // Sleek luminaire head housing
                GameObject housing = GameObject.CreatePrimitive(PrimitiveType.Cube);
                housing.name = "LuminaireHousing";
                housing.transform.SetParent(poleRoot.transform, false);
                housing.transform.localPosition = new Vector3(0f, 10.95f, 1.45f);
                housing.transform.localScale = new Vector3(0.52f, 0.18f, 0.88f);
                DestroyColliderImmediateOrRuntime(housing);
                ApplyMaterial(housing, darkSteelMaterial, ShadowCastingMode.Off);

                // Glowing Sodium Vapor emitter lens
                GameObject emitter = GameObject.CreatePrimitive(PrimitiveType.Cube);
                emitter.name = "SodiumEmitterLens";
                emitter.transform.SetParent(poleRoot.transform, false);
                emitter.transform.localPosition = new Vector3(0f, 10.84f, 1.45f);
                emitter.transform.localScale = new Vector3(0.42f, 0.06f, 0.72f);
                DestroyColliderImmediateOrRuntime(emitter);
                ApplyMaterial(emitter, sodiumEmissiveMaterial, ShadowCastingMode.Off);

                if (haloMat != null)
                {
                    GameObject haloQuad = GameObject.CreatePrimitive(PrimitiveType.Quad);
                    haloQuad.name = "SodiumHaloBillboard";
                    haloQuad.transform.SetParent(poleRoot.transform, false);
                    haloQuad.transform.localPosition = new Vector3(0f, 10.76f, 1.45f);
                    haloQuad.transform.localScale = Vector3.one * 2.4f;
                    DestroyColliderImmediateOrRuntime(haloQuad);
                    ApplyMaterial(haloQuad, haloMat, ShadowCastingMode.Off);
                    haloQuad.AddComponent<LamppostBillboardHalo>();
                }

                // Downward warm #FF9B38 Spot Light (WebGL-safe: LightShadows.None)
                GameObject lightObj = new GameObject("SodiumVaporLight");
                lightObj.transform.SetParent(poleRoot.transform, false);
                lightObj.transform.localPosition = new Vector3(0f, 10.75f, 1.45f);
                lightObj.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);

                Light spotLight = lightObj.AddComponent<Light>();
                spotLight.type = LightType.Spot;
                spotLight.color = sodiumColor;
                spotLight.range = 28f;
                spotLight.intensity = 32f;
                spotLight.spotAngle = 115f;
                spotLight.innerSpotAngle = 62f;
                spotLight.shadows = LightShadows.None;
                spotLight.renderMode = LightRenderMode.Auto;

                if (floodlights != null)
                {
                    floodlights.Add(spotLight);
                }
            }
        }

        private static Material CreateWetPuddleMaterial()
        {
            Shader shader = FindUrpOrFallbackShader();
            Material mat = new Material(shader)
            {
                name = "Mat_WetAsphaltPuddle"
            };

            Color baseColor = new Color(0.008f, 0.010f, 0.014f, 0.72f);
            mat.SetColor("_BaseColor", baseColor);
            mat.SetColor("_Color", baseColor);
            mat.SetFloat("_Metallic", 0.0f);
            mat.SetFloat("_Smoothness", 0.72f);
            mat.SetFloat("_Glossiness", 0.94f);

            // Configure URP Transparent surface for mirror-like wet puddle alpha blend
            mat.SetFloat("_Surface", 1f);
            mat.SetFloat("_Blend", 0f);
            mat.SetFloat("_AlphaClip", 0f);
            mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            mat.SetFloat("_ZWrite", 0f);
            mat.SetFloat("_SpecularHighlights", 1f);
            mat.SetFloat("_EnvironmentReflections", 1f);
            mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            mat.SetOverrideTag("RenderType", "Transparent");
            mat.renderQueue = (int)RenderQueue.Transparent;

            return mat;
        }

        private static Material CreateDarkSteelMaterial()
        {
            Shader shader = FindUrpOrFallbackShader();
            Material mat = new Material(shader)
            {
                name = "Mat_ShipyardPoleSteel"
            };

            Color steelColor = new Color(0.11f, 0.13f, 0.16f, 1f);
            mat.SetColor("_BaseColor", steelColor);
            mat.SetColor("_Color", steelColor);
            mat.SetFloat("_Metallic", 0.78f);
            mat.SetFloat("_Smoothness", 0.48f);
            mat.SetFloat("_Glossiness", 0.48f);
            mat.SetFloat("_Surface", 0f);

            return mat;
        }

        private static Material CreateSodiumEmissiveMaterial()
        {
            Shader shader = FindUrpOrFallbackShader();
            Material mat = new Material(shader)
            {
                name = "Mat_SodiumVaporLamp"
            };

            Color sodiumColor = new Color(1f, 0.60784316f, 0.21960784f, 1f); // #FF9B38
            mat.SetColor("_BaseColor", sodiumColor);
            mat.SetColor("_Color", sodiumColor);
            mat.SetFloat("_Metallic", 0f);
            mat.SetFloat("_Smoothness", 0.85f);
            mat.SetFloat("_Surface", 0f);

            mat.EnableKeyword("_EMISSION");
            mat.SetColor("_EmissionColor", sodiumColor * 3.8f);
            mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;

            return mat;
        }

        private static Shader FindUrpOrFallbackShader()
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            if (shader == null)
            {
                shader = Shader.Find("Sprites/Default");
            }

            return shader;
        }

        private static void ApplyMaterial(GameObject target, Material material, ShadowCastingMode shadowMode)
        {
            MeshRenderer renderer = target.GetComponent<MeshRenderer>();
            if (renderer != null)
            {
                renderer.sharedMaterial = material;
                renderer.shadowCastingMode = shadowMode;
            }
        }

        private static void DestroyColliderImmediateOrRuntime(GameObject target)
        {
            Collider col = target.GetComponent<Collider>();
            if (col == null)
            {
                return;
            }

            if (Application.isPlaying)
            {
                Object.Destroy(col);
            }
            else
            {
                Object.DestroyImmediate(col);
            }
        }
    }
}
