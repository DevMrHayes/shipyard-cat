using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using ShipyardCat.Core;

namespace ShipyardCat.Editor
{
    public static class VisualBaselineSetup
    {
        [MenuItem("ShipyardCat/Apply Visual Baseline")]
        public static string Apply()
        {
            // 1. Ensure Settings folder exists
            if (!AssetDatabase.IsValidFolder("Assets/ShipyardCat/Settings"))
            {
                if (!AssetDatabase.IsValidFolder("Assets/ShipyardCat"))
                    AssetDatabase.CreateFolder("Assets", "ShipyardCat");
                AssetDatabase.CreateFolder("Assets/ShipyardCat", "Settings");
            }
            if (!AssetDatabase.IsValidFolder("Assets/Scenes"))
                AssetDatabase.CreateFolder("Assets", "Scenes");

            // 2. Verify URP & enable HDR
            var urpAsset = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (urpAsset == null)
                throw new System.Exception("URP is not the active render pipeline.");

            urpAsset.supportsHDR = true;
            EditorUtility.SetDirty(urpAsset);

            // Set Quality Tier appropriate for WebGL (first/lowest or balanced URP tier)
            var qNames = QualitySettings.names;
            if (qNames != null && qNames.Length > 0)
            {
                // Keep Balanced/WebGL friendly tier (index 0 or "Performant"/"Balanced" if present)
                int targetTier = 0;
                for (int i = 0; i < qNames.Length; i++)
                {
                    if (qNames[i].ToLower().Contains("balanced") || qNames[i].ToLower().Contains("performant"))
                    {
                        targetTier = i;
                        break;
                    }
                }
                QualitySettings.SetQualityLevel(targetTier, true);
            }

            // 3. Create or open ShipyardMain scene
            string scenePath = "Assets/Scenes/ShipyardMain.unity";
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            // 4. Configure Main Camera (Perspective + Post Processing)
            var cam = Camera.main;
            if (cam != null)
            {
                cam.transform.position = new Vector3(-10f, 3.2f, -25f);
                cam.transform.LookAt(new Vector3(-10f, 0.5f, -20f));
                cam.farClipPlane = 600f;
                var camData = cam.GetComponent<UniversalAdditionalCameraData>();
                if (camData == null)
                    camData = cam.gameObject.AddComponent<UniversalAdditionalCameraData>();
                camData.renderPostProcessing = true;
                camData.volumeLayerMask = 1; // Default layer
            }

            // 5. Configure Key Directional Light (Warm Coastal Sun, 42 deg elev, soft shadows)
            var lights = Object.FindObjectsByType<Light>(FindObjectsSortMode.None);
            Light sun = null;
            foreach (var l in lights)
            {
                if (l.type == LightType.Directional) { sun = l; break; }
            }
            if (sun == null)
            {
                var sunGo = new GameObject("Directional Sun");
                sun = sunGo.AddComponent<Light>();
                sun.type = LightType.Directional;
            }
            sun.name = "ShipyardSunLight";
            sun.color = ShipyardPalette.DaySunWarm;
            sun.intensity = 1.3f;
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(42f, -35f, 0f);

            // 6. Gradient Ambient & Marine Exponential Fog
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ShipyardPalette.AmbientSkyDay;
            RenderSettings.ambientEquatorColor = ShipyardPalette.AmbientEquator;
            RenderSettings.ambientGroundColor = ShipyardPalette.AmbientGround;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = ShipyardPalette.MarineFogDay;
            RenderSettings.fogDensity = 0.0065f;

            // 7. Create Global Volume + Profile (ACES, Bloom, Vignette, ColorAdjustments)
            string profilePath = "Assets/ShipyardCat/Settings/ShipyardVolumeProfile.asset";
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(profilePath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(profile, profilePath);
            }

            if (!profile.TryGet<Tonemapping>(out var tonemapping))
                tonemapping = profile.Add<Tonemapping>(true);
            tonemapping.mode.Override(TonemappingMode.ACES);

            if (!profile.TryGet<Bloom>(out var bloom))
                bloom = profile.Add<Bloom>(true);
            bloom.intensity.Override(0.35f);
            bloom.threshold.Override(1.1f);

            if (!profile.TryGet<Vignette>(out var vignette))
                vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.22f);

            if (!profile.TryGet<ColorAdjustments>(out var colorAdj))
                colorAdj = profile.Add<ColorAdjustments>(true);
            colorAdj.saturation.Override(8f);
            colorAdj.contrast.Override(5f);

            EditorUtility.SetDirty(profile);

            var volGo = new GameObject("GlobalPostProcessVolume");
            volGo.layer = 0;
            var vol = volGo.AddComponent<Volume>();
            vol.isGlobal = true;
            vol.sharedProfile = profile;
            vol.enabled = true;

            // 8. Save Scene & Build Settings
            EditorSceneManager.SaveScene(scene, scenePath);
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(scenePath, true)
            };
            AssetDatabase.SaveAssets();

            return "Visual baseline applied and ShipyardMain.unity saved.";
        }
    }
}
