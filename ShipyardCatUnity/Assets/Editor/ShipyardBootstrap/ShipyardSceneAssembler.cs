using System.Collections.Generic;
using Unity.AI.Navigation;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.UIElements;
using ShipyardCat.AI;
using ShipyardCat.Core;
using ShipyardCat.Player;
using ShipyardCat.UI;
using ShipyardCat.World;

namespace ShipyardCat.Editor
{
    public static class ShipyardSceneAssembler
    {
        [MenuItem("ShipyardCat/Assemble Complete ShipyardMain Scene")]
        public static string Assemble()
        {
            var scene = EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            // Clean previous assembled root if re-running
            var existingRoot = GameObject.Find("ShipyardWorldRoot");
            if (existingRoot != null) Object.DestroyImmediate(existingRoot);
            var existingManagers = GameObject.Find("ShipyardManagers");
            if (existingManagers != null) Object.DestroyImmediate(existingManagers);
            var existingAlba = GameObject.Find("Alba_Player");
            if (existingAlba != null) Object.DestroyImmediate(existingAlba);
            var existingHud = GameObject.Find("ShipyardHUD");
            if (existingHud != null) Object.DestroyImmediate(existingHud);

            // 1. Create Materials Folder & URP Lit Materials from ShipyardPalette + 1K PBR Textures
            EnsureFolder("Assets/ShipyardCat/Materials");
            var urpLit = Shader.Find("Universal Render Pipeline/Lit");
            if (urpLit == null)
                throw new System.Exception("Universal Render Pipeline/Lit shader not found.");

            var asphaltMat = CreatePBRMaterial("AsphaltYardMat", urpLit, ShipyardPalette.CharcoalAsphalt,
                "Assets/ShipyardCat/Imported/Textures/asphalt_diff_1k.jpg",
                "Assets/ShipyardCat/Imported/Textures/asphalt_nor_1k.jpg",
                "Assets/ShipyardCat/Imported/Textures/asphalt_ao_1k.jpg",
                new Vector2(36f, 44f), 0.05f, 0.28f);

            var concreteMat = CreatePBRMaterial("ConcreteDockMat", urpLit, ShipyardPalette.ConcreteDeck,
                null,
                "Assets/ShipyardCat/Imported/Textures/brick_nor_1k.jpg",
                null,
                new Vector2(6f, 6f), 0.08f, 0.22f);

            var steelMat = CreatePBRMaterial("IndustrialSteelMat", urpLit, ShipyardPalette.SteelHullDark,
                "Assets/ShipyardCat/Imported/Textures/metal_diff_1k.jpg",
                "Assets/ShipyardCat/Imported/Textures/metal_nor_1k.jpg",
                null,
                new Vector2(4f, 4f), 0.72f, 0.48f);

            var subMat = CreateSimpleMaterial("SubmarineAnechoicMat", urpLit, ShipyardPalette.SubmarineAnechoic, 0.25f, 0.35f);
            var waterMat = CreateSimpleMaterial("JamesRiverWaterMat", urpLit, ShipyardPalette.DeepSeaWater, 0.1f, 0.85f);
            var safetyAmberMat = CreateSimpleMaterial("SafetyAmberMat", urpLit, ShipyardPalette.SafetyAmber, 0.35f, 0.55f);
            var sanctuaryMat = CreateSimpleMaterial("CatHavenMat", urpLit, ShipyardPalette.ChangingSeaFoam, 0.15f, 0.45f);
            var kingpinMat = CreateSimpleMaterial("KingpinBossMat", urpLit, ShipyardPalette.KingpinCrimson, 0.2f, 0.5f);
            var ratMat = CreateSimpleMaterial("RatPreyMat", urpLit, ShipyardPalette.ThermalPreyAmber, 0.1f, 0.35f);

            // 2. World Root + Walkable NavMesh Surface Container
            var worldRoot = new GameObject("ShipyardWorldRoot");
            var walkableRoot = new GameObject("WalkableNavMeshGeometry");
            walkableRoot.transform.SetParent(worldRoot.transform);

            // Main Yard Slab (X: [-220, 60], Z: [-105, 300] => size 280 x 405, center (-80, -0.5, 97.5))
            CreateBox("YardAsphaltGround", walkableRoot.transform, new Vector3(-80f, -0.5f, 97.5f), new Vector3(280f, 1f, 405f), asphaltMat);

            // James River Backdrop (East edge X > 60)
            CreateBox("JamesRiverWater", worldRoot.transform, new Vector3(130f, -1.5f, 97.5f), new Vector3(140f, 1f, 460f), waterMat, false);

            // Perimeter Security Fence enclosing X: [-220, 60], Z: [-105, 300]
            var fenceRoot = new GameObject("PerimeterSecurityFence");
            fenceRoot.transform.SetParent(worldRoot.transform);
            CreateBox("Fence_West", fenceRoot.transform, new Vector3(-220f, 2f, 97.5f), new Vector3(1f, 4f, 405f), steelMat);
            CreateBox("Fence_North", fenceRoot.transform, new Vector3(-80f, 2f, 300f), new Vector3(280f, 4f, 1f), steelMat);
            CreateBox("Fence_South", fenceRoot.transform, new Vector3(-80f, 2f, -105f), new Vector3(280f, 4f, 1f), steelMat);
            CreateBox("Fence_East", fenceRoot.transform, new Vector3(60f, 2f, 97.5f), new Vector3(1f, 4f, 405f), steelMat);

            // 3. Dry Dock 1 (Kingpin Arena) at (-45, -2, 20) with walkable floor + ramp
            var dd1 = new GameObject("DryDock1_KingpinArena");
            dd1.transform.SetParent(walkableRoot.transform);
            CreateBox("DD1_BasinFloor", dd1.transform, new Vector3(-45f, -2.5f, 20f), new Vector3(36f, 1f, 44f), concreteMat);
            CreateBox("DD1_Curb_West", dd1.transform, new Vector3(-63.5f, -0.5f, 20f), new Vector3(1f, 3f, 44f), safetyAmberMat);
            CreateBox("DD1_Curb_East", dd1.transform, new Vector3(-26.5f, -0.5f, 20f), new Vector3(1f, 3f, 44f), safetyAmberMat);
            var dd1Ramp = CreateBox("DD1_DescentRamp", dd1.transform, new Vector3(-45f, -1.0f, -4f), new Vector3(8f, 0.5f, 14f), concreteMat);
            dd1Ramp.transform.rotation = Quaternion.Euler(12f, 0f, 0f);

            // 4. Dry Dock 12 (CVN-80 Carrier + Big Blue Gantry Crane) at (15, 0, 50)
            var dd12 = new GameObject("DryDock12_CVN80");
            dd12.transform.SetParent(worldRoot.transform);
            CreateBox("CVN80_Hull", dd12.transform, new Vector3(15f, 2.5f, 50f), new Vector3(26f, 6f, 90f), steelMat);
            CreateBox("CVN80_FlightDeck", walkableRoot.transform, new Vector3(15f, 5.6f, 50f), new Vector3(28f, 0.4f, 92f), asphaltMat);
            var cvnGangway = CreateBox("CVN80_Gangway", walkableRoot.transform, new Vector3(-2f, 2.8f, 44f), new Vector3(14f, 0.4f, 4f), safetyAmberMat);
            cvnGangway.transform.rotation = Quaternion.Euler(0f, 0f, 22f);
            // Big Blue Gantry Legs
            CreateBox("BigBlue_LegW", dd12.transform, new Vector3(-5f, 18f, 50f), new Vector3(3f, 36f, 3f), steelMat);
            CreateBox("BigBlue_LegE", dd12.transform, new Vector3(35f, 18f, 50f), new Vector3(3f, 36f, 3f), steelMat);
            CreateBox("BigBlue_Bridge", dd12.transform, new Vector3(15f, 36f, 50f), new Vector3(46f, 4f, 5f), safetyAmberMat);

            // 5. Dry Dock 2 (Virginia-Class Submarine Berth) at (-180, 0, 110)
            var dd2 = new GameObject("DryDock2_SSNVirginia");
            dd2.transform.SetParent(worldRoot.transform);
            CreateBox("DD2_BasinFloor", walkableRoot.transform, new Vector3(-180f, -2.5f, 110f), new Vector3(32f, 1f, 95f), concreteMat);
            var subHull = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            subHull.name = "SSN_Virginia_Hull";
            subHull.transform.SetParent(dd2.transform);
            subHull.transform.position = new Vector3(-180f, 1.5f, 110f);
            subHull.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            subHull.transform.localScale = new Vector3(10f, 38f, 10f);
            subHull.GetComponent<Renderer>().sharedMaterial = subMat;
            CreateBox("SSN_Virginia_Sail", dd2.transform, new Vector3(-180f, 7.5f, 120f), new Vector3(2.8f, 5f, 8f), subMat);

            // Steam Vents along Dry Dock 2
            CreateVFXNode("DD2_SteamVent_1", worldRoot.transform, new Vector3(-180f, 1.5f, 85f), WeldingAndSteamVFX.Mode.SteamVent);
            CreateVFXNode("DD2_SteamVent_2", worldRoot.transform, new Vector3(-180f, 1.5f, 135f), WeldingAndSteamVFX.Mode.SteamVent);

            // 6. Heavy Steel Fab Super-Shop at (-115, 0, 240)
            var fabShop = new GameObject("HeavySteelFabSuperShop");
            fabShop.transform.SetParent(worldRoot.transform);
            CreateBox("FabShop_Roof", fabShop.transform, new Vector3(-115f, 14f, 240f), new Vector3(52f, 1.2f, 82f), steelMat);
            CreateBox("FabShop_WallW", fabShop.transform, new Vector3(-140.5f, 7f, 240f), new Vector3(1.2f, 14f, 82f), concreteMat);
            CreateBox("FabShop_WallE", fabShop.transform, new Vector3(-89.5f, 7f, 240f), new Vector3(1.2f, 14f, 82f), concreteMat);
            CreateBox("FabShop_WallN", fabShop.transform, new Vector3(-115f, 7f, 280.5f), new Vector3(52f, 14f, 1.2f), concreteMat);
            // Welding Spark Stations inside Super-Shop
            CreateVFXNode("FabShop_Welder_1", worldRoot.transform, new Vector3(-105f, 1.8f, 225f), WeldingAndSteamVFX.Mode.WeldingSparks);
            CreateVFXNode("FabShop_Welder_2", worldRoot.transform, new Vector3(-125f, 1.8f, 255f), WeldingAndSteamVFX.Mode.WeldingSparks);

            // 7. Cat Haven Sanctuary (-15, 0, -45) & Radiation Vault (45, 0, -60)
            var haven = CreateBox("CatHaven_SanctuaryPad", walkableRoot.transform, new Vector3(-15f, 0.1f, -45f), new Vector3(10f, 0.2f, 10f), sanctuaryMat);
            var havenZone = haven.AddComponent<RadiationZone>();
            havenZone.ZoneType = ShipyardZone.CatHavenSanctuary;
            havenZone.IsSanctuary = true;
            havenZone.Radius = 7f;

            var vault = CreateBox("RadiationVault_Bunker", worldRoot.transform, new Vector3(45f, 3f, -60f), new Vector3(14f, 6f, 14f), safetyAmberMat);
            var radZone = vault.AddComponent<RadiationZone>();
            radZone.ZoneType = ShipyardZone.DryDock2_SSNVirginia;
            radZone.IsSanctuary = false;
            radZone.Radius = 14f;

            // 8. High-Mast Stadium Floodlights
            var floodlights = new List<Light>();
            floodlights.Add(CreateFloodlight("Floodlight_SouthYard", worldRoot.transform, new Vector3(-20f, 26f, -30f)));
            floodlights.Add(CreateFloodlight("Floodlight_DryDock1", worldRoot.transform, new Vector3(-45f, 26f, 20f)));
            floodlights.Add(CreateFloodlight("Floodlight_DryDock2", worldRoot.transform, new Vector3(-175f, 28f, 110f)));
            floodlights.Add(CreateFloodlight("Floodlight_FabShop", worldRoot.transform, new Vector3(-115f, 26f, 230f)));

            // 9. Bake NavMesh on Walkable Geometry
            var navSurface = walkableRoot.AddComponent<NavMeshSurface>();
            navSurface.collectObjects = CollectObjects.Children;
            navSurface.BuildNavMesh();

            // 10. Managers & Systems
            var managersGo = new GameObject("ShipyardManagers");
            var gameManager = managersGo.AddComponent<ShipyardGameManager>();
            var loopManager = managersGo.AddComponent<GameLoopManager>();

            var diurnal = managersGo.AddComponent<DiurnalShiftManager>();
            var sunLight = GameObject.Find("ShipyardSunLight")?.GetComponent<Light>();
            var soDiurnal = new SerializedObject(diurnal);
            if (sunLight != null) soDiurnal.FindProperty("sunLight").objectReferenceValue = sunLight;
            var floodProp = soDiurnal.FindProperty("floodlights");
            if (floodProp != null)
            {
                floodProp.arraySize = floodlights.Count;
                for (int i = 0; i < floodlights.Count; i++)
                    floodProp.GetArrayElementAtIndex(i).objectReferenceValue = floodlights[i];
            }
            soDiurnal.ApplyModifiedPropertiesWithoutUndo();

            var audioMgr = managersGo.AddComponent<ShipyardAudioManager>();
            var yardClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/ShipyardCat/Imported/Audio/Paws_at_the_Pier.mp3");
            var bossClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/ShipyardCat/Imported/Audio/Titan_s_Gantry.mp3");
            var soAudio = new SerializedObject(audioMgr);
            if (yardClip != null) soAudio.FindProperty("yardClip").objectReferenceValue = yardClip;
            if (bossClip != null) soAudio.FindProperty("bossClip").objectReferenceValue = bossClip;
            soAudio.ApplyModifiedPropertiesWithoutUndo();

            // 11. Alba Player Setup (at spawn -10, 0.5, -20)
            var albaGo = new GameObject("Alba_Player");
            albaGo.transform.position = new Vector3(-10f, 0.5f, -20f);
            var cc = albaGo.AddComponent<CharacterController>();
            cc.center = new Vector3(0f, 0.45f, 0f);
            cc.radius = 0.35f;
            cc.height = 0.9f;

            var vitals = albaGo.AddComponent<CatVitals>();
            var sonar = albaGo.AddComponent<WhiskersSonarController>();
            var albaCtrl = albaGo.AddComponent<AlbaController>();

            // Visual body for Alba (loads cat.glb or builds stylized feline fallback)
            var catPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/ShipyardCat/Imported/Models/cat.glb");
            if (catPrefab != null)
            {
                var catModel = (GameObject)PrefabUtility.InstantiatePrefab(catPrefab, albaGo.transform);
                catModel.name = "Alba_GLB_Model";
                catModel.transform.localPosition = Vector3.zero;
            }
            else
            {
                BuildStylizedAlbaVisual(albaGo.transform, urpLit);
            }

            // Wire AlbaCameraRig on Main Camera
            var mainCam = Camera.main;
            if (mainCam != null)
            {
                var camRig = mainCam.GetComponent<AlbaCameraRig>() ?? mainCam.gameObject.AddComponent<AlbaCameraRig>();
                camRig.SetTarget(albaGo.transform);
            }

            // 12. Dockyard Kingpin Boss in Dry Dock 1 Basin (-45, -1.9, 25)
            var kingpinGo = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            kingpinGo.name = "DockyardKingpin_Boss";
            kingpinGo.transform.position = new Vector3(-45f, -1.4f, 25f);
            kingpinGo.transform.localScale = new Vector3(1.8f, 1.3f, 2.2f);
            kingpinGo.GetComponent<Renderer>().sharedMaterial = kingpinMat;
            kingpinGo.AddComponent<UnityEngine.AI.NavMeshAgent>();
            kingpinGo.AddComponent<KingpinBossAI>();

            // 13. Spawn Rat Prey across the Yard
            var ratSpawns = new[]
            {
                new Vector3(-14f, 0.3f, -10f),
                new Vector3(-22f, 0.3f, 5f),
                new Vector3(-6f, 0.3f, 15f),
                new Vector3(-55f, 0.3f, 45f),
                new Vector3(-110f, 0.3f, 220f),
                new Vector3(-125f, 0.3f, 250f),
                new Vector3(-165f, 0.3f, 95f),
                new Vector3(5f, 0.3f, -35f)
            };
            var ratPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/ShipyardCat/Imported/Models/rat.glb");
            for (int i = 0; i < ratSpawns.Length; i++)
            {
                var ratGo = new GameObject($"RatPrey_{i + 1}");
                ratGo.transform.position = ratSpawns[i];
                var col = ratGo.AddComponent<SphereCollider>();
                col.radius = 0.45f;
                col.center = new Vector3(0f, 0.25f, 0f);
                if (ratPrefab != null)
                {
                    var ratMesh = (GameObject)PrefabUtility.InstantiatePrefab(ratPrefab, ratGo.transform);
                    ratMesh.name = "Rat_GLB_Model";
                    ratMesh.transform.localPosition = Vector3.zero;
                    ratMesh.transform.localRotation = Quaternion.Euler(0f, 180f, 0f); // Snout forward (+Z)
                }
                else
                {
                    var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                    body.transform.SetParent(ratGo.transform);
                    body.transform.localPosition = new Vector3(0f, 0.2f, 0f);
                    body.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                    body.transform.localScale = new Vector3(0.32f, 0.45f, 0.28f);
                    body.GetComponent<Renderer>().sharedMaterial = ratMat;
                    Object.DestroyImmediate(body.GetComponent<Collider>());
                }
                ratGo.AddComponent<UnityEngine.AI.NavMeshAgent>();
                ratGo.AddComponent<RatPreyAI>();
            }

            // 14. UI Toolkit HUD Setup
            var panelPath = "Assets/ShipyardCat/Settings/ShipyardPanelSettings.asset";
            var panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>(panelPath);
            if (panelSettings == null)
            {
                panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
                panelSettings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                panelSettings.referenceResolution = new Vector2Int(1920, 1080);
                AssetDatabase.CreateAsset(panelSettings, panelPath);
            }

            var hudGo = new GameObject("ShipyardHUD");
            var uiDoc = hudGo.AddComponent<UIDocument>();
            uiDoc.panelSettings = panelSettings;
            var uxml = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/ShipyardCat/UI/ShipyardHUD.uxml");
            if (uxml != null) uiDoc.visualTreeAsset = uxml;
            var hudCtrl = hudGo.AddComponent<ShipyardHUDController>();

            // Save Scene & Assets
            EditorSceneManager.SaveScene(scene, "Assets/Scenes/ShipyardMain.unity");
            AssetDatabase.SaveAssets();

            return "ShipyardMain.unity assembled: PBR materials, Dry Docks 1/2/12, Fab Super-Shop, NavMesh baked, Alba, Kingpin, 8 Rats, VFX, Audio, and UI Toolkit HUD.";
        }

        private static void EnsureFolder(string path)
        {
            var parts = path.Split('/');
            string curr = parts[0];
            for (int i = 1; i < parts.Length; i++)
            {
                string next = curr + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next))
                    AssetDatabase.CreateFolder(curr, parts[i]);
                curr = next;
            }
        }

        private static Material CreatePBRMaterial(string name, Shader shader, Color tint, string diffPath, string normPath, string aoPath, Vector2 tiling, float metallic, float smoothness)
        {
            string path = $"Assets/ShipyardCat/Materials/{name}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(shader);
                AssetDatabase.CreateAsset(mat, path);
            }
            mat.SetColor("_BaseColor", tint);
            mat.SetFloat("_Metallic", metallic);
            mat.SetFloat("_Smoothness", smoothness);
            mat.mainTextureScale = tiling;

            if (!string.IsNullOrEmpty(diffPath))
            {
                var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(diffPath);
                if (tex != null) mat.SetTexture("_BaseMap", tex);
            }
            if (!string.IsNullOrEmpty(normPath))
            {
                var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(normPath);
                if (tex != null) mat.SetTexture("_BumpMap", tex);
            }
            if (!string.IsNullOrEmpty(aoPath))
            {
                var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(aoPath);
                if (tex != null) mat.SetTexture("_OcclusionMap", tex);
            }
            EditorUtility.SetDirty(mat);
            return mat;
        }

        private static Material CreateSimpleMaterial(string name, Shader shader, Color color, float metallic, float smoothness)
        {
            return CreatePBRMaterial(name, shader, color, null, null, null, Vector2.one, metallic, smoothness);
        }

        private static GameObject CreateBox(string name, Transform parent, Vector3 pos, Vector3 scale, Material mat, bool withCollider = true)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent);
            go.transform.position = pos;
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            if (!withCollider)
            {
                var c = go.GetComponent<Collider>();
                if (c != null) Object.DestroyImmediate(c);
            }
            return go;
        }

        private static void CreateVFXNode(string name, Transform parent, Vector3 pos, WeldingAndSteamVFX.Mode mode)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent);
            go.transform.position = pos;
            var vfx = go.AddComponent<WeldingAndSteamVFX>();
            var so = new SerializedObject(vfx);
            so.FindProperty("effectMode").enumValueIndex = (int)mode;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        private static Light CreateFloodlight(string name, Transform parent, Vector3 pos)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent);
            go.transform.position = pos;
            go.transform.rotation = Quaternion.Euler(70f, 0f, 0f);
            var light = go.AddComponent<Light>();
            light.type = LightType.Spot;
            light.range = 85f;
            light.spotAngle = 95f;
            light.intensity = 1.0f;
            light.color = ShipyardPalette.SafetyAmber;
            return light;
        }

        private static void BuildStylizedAlbaVisual(Transform parent, Shader urpLit)
        {
            var furMat = CreateSimpleMaterial("AlbaFurPrimaryMat", urpLit, ShipyardPalette.AlbaFurPrimary, 0.05f, 0.25f);
            var collarMat = CreateSimpleMaterial("AlbaCollarMat", urpLit, ShipyardPalette.AlbaCollar, 0.1f, 0.5f);
            var body = CreateBox("Alba_Body", parent, parent.position + new Vector3(0, 0.38f, 0), new Vector3(0.32f, 0.28f, 0.65f), furMat, false);
            body.transform.localPosition = new Vector3(0, 0.38f, 0);
            var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.name = "Alba_Head";
            head.transform.SetParent(parent);
            head.transform.localPosition = new Vector3(0, 0.55f, 0.32f);
            head.transform.localScale = new Vector3(0.28f, 0.26f, 0.28f);
            head.GetComponent<Renderer>().sharedMaterial = furMat;
            Object.DestroyImmediate(head.GetComponent<Collider>());
            var collar = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            collar.name = "Alba_Collar";
            collar.transform.SetParent(parent);
            collar.transform.localPosition = new Vector3(0, 0.45f, 0.24f);
            collar.transform.localScale = new Vector3(0.24f, 0.05f, 0.24f);
            collar.GetComponent<Renderer>().sharedMaterial = collarMat;
            Object.DestroyImmediate(collar.GetComponent<Collider>());
        }
    }
}
