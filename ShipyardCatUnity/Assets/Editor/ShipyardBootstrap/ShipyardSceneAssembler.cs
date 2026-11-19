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

            // Clean up any legacy root-level rats or bosses from earlier assemblies
            foreach (var oldRat in Object.FindObjectsByType<RatPreyAI>(FindObjectsSortMode.None))
            {
                if (oldRat != null) Object.DestroyImmediate(oldRat.gameObject);
            }
            foreach (var oldBoss in Object.FindObjectsByType<KingpinBossAI>(FindObjectsSortMode.None))
            {
                if (oldBoss != null) Object.DestroyImmediate(oldBoss.gameObject);
            }

            // 1. Create Materials Folder & URP Lit Materials from ShipyardPalette + 1K PBR Textures
            EnsureFolder("Assets/ShipyardCat/Materials");
            var urpLit = Shader.Find("Universal Render Pipeline/Lit");
            if (urpLit == null)
                throw new System.Exception("Universal Render Pipeline/Lit shader not found.");

            var asphaltMat = CreatePBRMaterial("AsphaltYardMat", urpLit, new Color(0.32f, 0.35f, 0.40f),
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

            // Cutout Yard Asphalt Slabs (top strictly Y = 0.000) Partitioning X: [-220, 56], Z: [-105, 300]
            // Leaves genuine open sunken basins for DD2 [-198,-162]x[52,208], DD12 [-156,-74]x[76,300], and DD1 [-62,-28]x[-17,67]
            CreateYardCutoutStrip("YardAsphalt_WestEdge", walkableRoot.transform, -220f, -198f, -105f, 300f, asphaltMat);
            CreateYardCutoutStrip("YardAsphalt_DD2_South", walkableRoot.transform, -198f, -162f, -105f, 52f, asphaltMat);
            CreateYardCutoutStrip("YardAsphalt_DD2_North", walkableRoot.transform, -198f, -162f, 208f, 300f, asphaltMat);
            CreateYardCutoutStrip("YardAsphalt_Between_DD2_DD12", walkableRoot.transform, -162f, -156f, -105f, 300f, asphaltMat);
            CreateYardCutoutStrip("YardAsphalt_DD12_South", walkableRoot.transform, -156f, -74f, -105f, 76f, asphaltMat);
            CreateYardCutoutStrip("YardAsphalt_Between_DD12_DD1", walkableRoot.transform, -74f, -62f, -105f, 300f, asphaltMat);
            CreateYardCutoutStrip("YardAsphalt_DD1_South", walkableRoot.transform, -62f, -28f, -105f, -17f, asphaltMat);
            CreateYardCutoutStrip("YardAsphalt_DD1_North", walkableRoot.transform, -62f, -28f, 67f, 300f, asphaltMat);
            CreateYardCutoutStrip("YardAsphalt_MainEastApron", walkableRoot.transform, -28f, 56f, -105f, 300f, asphaltMat);

            // Perimeter Security Fence enclosing X: [-220, 56], Z: [-105, 300] (East waterfront stays open to pier)
            var fenceRoot = new GameObject("PerimeterSecurityFence");
            fenceRoot.transform.SetParent(worldRoot.transform);
            CreateBox("Fence_West", fenceRoot.transform, new Vector3(-220f, 2f, 97.5f), new Vector3(1f, 4f, 405f), steelMat);
            CreateBox("Fence_North", fenceRoot.transform, new Vector3(-82f, 2f, 300f), new Vector3(276f, 4f, 1f), steelMat);
            CreateBox("Fence_South", fenceRoot.transform, new Vector3(-82f, 2f, -105f), new Vector3(276f, 4f, 1f), steelMat);
            CreateBox("Seawall_Curb_South", fenceRoot.transform, new Vector3(56f, 0.25f, -80f), new Vector3(0.6f, 0.5f, 50f), safetyAmberMat);
            CreateBox("Seawall_Curb_North", fenceRoot.transform, new Vector3(56f, 0.25f, 220f), new Vector3(0.6f, 0.5f, 160f), safetyAmberMat);

            // 6. Heavy Steel Fab Super-Shop at West Industrial Bay (-168, 0, -25) (clear of DD2 & DD12)
            var fabShop = new GameObject("HeavySteelFabSuperShop");
            fabShop.transform.SetParent(worldRoot.transform);
            CreateBox("FabShop_Roof", fabShop.transform, new Vector3(-168f, 14f, -25f), new Vector3(44f, 1.2f, 64f), steelMat);
            CreateBox("FabShop_WallW", fabShop.transform, new Vector3(-189.4f, 7f, -25f), new Vector3(1.2f, 14f, 64f), steelMat);
            CreateBox("FabShop_WallS", fabShop.transform, new Vector3(-168f, 7f, -56.4f), new Vector3(44f, 14f, 1.2f), steelMat);
            CreateBox("FabShop_TrimNW", fabShop.transform, new Vector3(-189.4f, 7f, 6.4f), new Vector3(1.5f, 14.2f, 1.5f), safetyAmberMat);
            CreateBox("FabShop_TrimNE", fabShop.transform, new Vector3(-146.6f, 7f, 6.4f), new Vector3(1.5f, 14.2f, 1.5f), safetyAmberMat);
            // Welding Spark Stations inside Super-Shop & Dock Rims
            CreateVFXNode("FabShop_Welder_1", worldRoot.transform, new Vector3(-160f, 1.8f, -15f), WeldingAndSteamVFX.Mode.WeldingSparks);
            CreateVFXNode("FabShop_Welder_2", worldRoot.transform, new Vector3(-175f, 1.8f, -35f), WeldingAndSteamVFX.Mode.WeldingSparks);
            CreateVFXNode("DD1_Rim_Welder", worldRoot.transform, new Vector3(-30f, 2.2f, 15f), WeldingAndSteamVFX.Mode.WeldingSparks);
            CreateVFXNode("DD1_Rim_Steam", worldRoot.transform, new Vector3(-32f, 0.5f, 40f), WeldingAndSteamVFX.Mode.SteamVent);
            CreateVFXNode("DD2_SteamVent_1", worldRoot.transform, new Vector3(-180f, 1.2f, 95f), WeldingAndSteamVFX.Mode.SteamVent);
            CreateVFXNode("DD2_SteamVent_2", worldRoot.transform, new Vector3(-180f, 1.2f, 165f), WeldingAndSteamVFX.Mode.SteamVent);

            // 7. Cat Haven Sanctuary (-15, 0, -45) & Radiation Vault (42, 0, -60)
            var haven = CreateBox("CatHaven_SanctuaryPad", walkableRoot.transform, new Vector3(-15f, 0.06f, -45f), new Vector3(10f, 0.12f, 10f), sanctuaryMat);
            var havenZone = haven.AddComponent<RadiationZone>();
            havenZone.ZoneType = ShipyardZone.CatHavenSanctuary;
            havenZone.IsSanctuary = true;
            havenZone.Radius = 7f;

            // Cat Haven Canopy & Plaza Props near Spawn (-10, 0, -20) for rich silhouette & scale
            CreateBox("CatHaven_CanopyRoof", worldRoot.transform, new Vector3(-15f, 2.8f, -45f), new Vector3(7f, 0.25f, 7f), safetyAmberMat);
            CreateBox("CatHaven_PillarNW", worldRoot.transform, new Vector3(-18f, 1.4f, -48f), new Vector3(0.3f, 2.8f, 0.3f), steelMat);
            CreateBox("CatHaven_PillarNE", worldRoot.transform, new Vector3(-12f, 1.4f, -48f), new Vector3(0.3f, 2.8f, 0.3f), steelMat);
            CreateBox("CargoContainer_Navy1", worldRoot.transform, new Vector3(-2f, 1.3f, -26f), new Vector3(2.5f, 2.6f, 6.1f), waterMat);
            CreateBox("CargoContainer_Amber2", worldRoot.transform, new Vector3(-2f, 1.3f, -18f), new Vector3(2.5f, 2.6f, 6.1f), safetyAmberMat);
            CreateBox("CableSpool_Rack", worldRoot.transform, new Vector3(-18f, 0.8f, -15f), new Vector3(2.2f, 1.6f, 2.2f), steelMat);

            var vault = CreateBox("RadiationVault_Bunker", worldRoot.transform, new Vector3(42f, 3f, -60f), new Vector3(14f, 6f, 14f), safetyAmberMat);
            var radZone = vault.AddComponent<RadiationZone>();
            radZone.ZoneType = ShipyardZone.DryDock2_SSNVirginia;
            radZone.IsSanctuary = false;
            radZone.Radius = 14f;

            // 7b. Canonical Shipyard Landmarks + Hero Details (DD1 Catwalk, Big Blue Sign, CVN-80, Rail Flatcar)
            ShipyardLandmarkBuilder.BuildAllLandmarks(walkableRoot.transform, concreteMat, steelMat, subMat, waterMat, safetyAmberMat, sanctuaryMat);
            DryDockHeroBuilder.BuildDryDockHeroDetails(walkableRoot.transform, concreteMat, steelMat, safetyAmberMat);
            CarrierAndCraneBuilder.BuildCraneSignageAndShipDetails(worldRoot.transform, steelMat, safetyAmberMat);
            YardPropsAndRailBuilder.BuildYardRailsAndProps(worldRoot.transform, steelMat, safetyAmberMat);

            // 8. High-Mast Stadium Floodlights, Wet Puddles & Twilight Skybox
            VisualBaselineSetup.ApplyTwilightSkybox();
            var floodlights = new List<Light>();
            floodlights.Add(CreateFloodlight("Floodlight_SouthYard", worldRoot.transform, new Vector3(-20f, 26f, -30f)));
            floodlights.Add(CreateFloodlight("Floodlight_DryDock1", worldRoot.transform, new Vector3(-45f, 26f, 20f)));
            floodlights.Add(CreateFloodlight("Floodlight_DryDock2", worldRoot.transform, new Vector3(-175f, 28f, 110f)));
            floodlights.Add(CreateFloodlight("Floodlight_FabShop", worldRoot.transform, new Vector3(-165f, 26f, -25f)));
            WetPuddleAndAtmosphereBuilder.BuildAtmosphereAndPuddles(worldRoot.transform, floodlights);

            // 9. Bake NavMesh on Walkable Geometry
            var navSurface = walkableRoot.AddComponent<NavMeshSurface>();
            navSurface.collectObjects = CollectObjects.Children;
            navSurface.BuildNavMesh();

            // 10. Managers & Systems
            var managersGo = new GameObject("ShipyardManagers");
            var gameManager = managersGo.AddComponent<ShipyardGameManager>();
            var loopManager = managersGo.AddComponent<GameLoopManager>();
            managersGo.AddComponent<MissionManager>();
            managersGo.AddComponent<ProgressionSystem>();
            managersGo.AddComponent<TacticalRadarController>();
            managersGo.AddComponent<GeigerAudioSynth>();
            managersGo.AddComponent<SpatialAudioWiring>();
            managersGo.AddComponent<ShipyardProgressBridge>();

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
            albaGo.AddComponent<PounceTrajectoryVisualizer>();

            // Subtle warm rim/aura light on Alba so she separates cleanly from asphalt
            var albaLightGo = new GameObject("Alba_RimLight");
            albaLightGo.transform.SetParent(albaGo.transform, false);
            albaLightGo.transform.localPosition = new Vector3(0f, 1.4f, -0.4f);
            var albaLight = albaLightGo.AddComponent<Light>();
            albaLight.type = LightType.Point;
            albaLight.color = ShipyardPalette.DaySunWarm;
            albaLight.intensity = 2.4f;
            albaLight.range = 8f;

            // Visual body for Alba (loads cat.glb or builds stylized feline fallback)
            var catPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/ShipyardCat/Imported/Models/cat.glb");
            if (catPrefab != null)
            {
                var scaleWrapper = new GameObject("Alba_ScaleWrapper");
                scaleWrapper.transform.SetParent(albaGo.transform, false);
                scaleWrapper.transform.localScale = Vector3.one * 1.45f; // ~0.72m long, proportional to shipyard

                var catModel = (GameObject)PrefabUtility.InstantiatePrefab(catPrefab, scaleWrapper.transform);
                catModel.name = "Alba_GLB_Model";
                catModel.transform.localPosition = Vector3.zero;
                if (catModel.GetComponent<Animator>() == null)
                    catModel.AddComponent<Animator>();

                var albaAnim = albaGo.AddComponent<AlbaAnimationDriver>();
                albaAnim.SetClips(
                    LoadClip("Assets/ShipyardCat/Imported/Models/cat.glb", "Cat|Idle_00-IP"),
                    LoadClip("Assets/ShipyardCat/Imported/Models/cat.glb", "Cat|Walk-IP"),
                    LoadClip("Assets/ShipyardCat/Imported/Models/cat.glb", "Cat|Run-IP"),
                    LoadClip("Assets/ShipyardCat/Imported/Models/cat.glb", "Cat|Sprint-IP"),
                    LoadClip("Assets/ShipyardCat/Imported/Models/cat.glb", "Cat|Jump_Run-IP"),
                    LoadClip("Assets/ShipyardCat/Imported/Models/cat.glb", "Cat|Attack_Right-IP")
                );
            }
            else
            {
                BuildStylizedAlbaVisual(albaGo.transform, urpLit);
            }

            // Apply Alba Tuxedo Coat + Fluorescent Orange Collar + Brass NNS Tag + Live Dosimeter
            var albaVisualRig = albaGo.AddComponent<AlbaVisualRig>();
            albaVisualRig.BuildOrRefreshVisuals();

            // Wire AlbaCameraRig on Main Camera
            var mainCam = Camera.main;
            if (mainCam != null)
            {
                var camRig = mainCam.GetComponent<AlbaCameraRig>() ?? mainCam.gameObject.AddComponent<AlbaCameraRig>();
                camRig.SetTarget(albaGo.transform);
            }

            var enemiesRoot = new GameObject("Enemies");
            enemiesRoot.transform.SetParent(worldRoot.transform, false);

            var ratPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/ShipyardCat/Imported/Models/rat.glb");

            // 12. Dockyard Kingpin Boss in Dry Dock 1 Basin (-45, -3.5, 25) - Scarred Giant Norway Rat GLB + Arena Rig
            var kingpinGo = new GameObject("DockyardKingpin_Boss");
            kingpinGo.transform.SetParent(enemiesRoot.transform, false);
            kingpinGo.transform.position = new Vector3(-45f, -3.5f, 25f);
            var kpCol = kingpinGo.AddComponent<CapsuleCollider>();
            kpCol.center = new Vector3(0f, 0.7f, 0f);
            kpCol.radius = 0.85f;
            kpCol.height = 1.9f;
            if (ratPrefab != null)
            {
                var kpWrapper = new GameObject("Kingpin_ScaleWrapper");
                kpWrapper.transform.SetParent(kingpinGo.transform, false);
                kpWrapper.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
                kpWrapper.transform.localScale = Vector3.one * 0.78f;

                var kpMesh = (GameObject)PrefabUtility.InstantiatePrefab(ratPrefab, kpWrapper.transform);
                kpMesh.name = "Rat_GLB_Model";
                kpMesh.transform.localPosition = Vector3.zero;
                if (kpMesh.GetComponent<Animator>() == null) kpMesh.AddComponent<Animator>();

                var kpScarMat = CreateSimpleMaterial("KingpinScarredFurMat", urpLit, new Color(0.24f, 0.19f, 0.18f), 0.1f, 0.25f);
                foreach (var rend in kpMesh.GetComponentsInChildren<Renderer>(true))
                {
                    rend.sharedMaterial = kpScarMat;
                }
                var kpAnim = kingpinGo.AddComponent<RatAnimationDriver>();
                kpAnim.SetClips(
                    LoadClip("Assets/ShipyardCat/Imported/Models/rat.glb", "Armature|Idle"),
                    LoadClip("Assets/ShipyardCat/Imported/Models/rat.glb", "Armature|Run")
                );
            }
            var kpEyeMat = CreateSimpleMaterial("KingpinRedEyeMat", urpLit, Color.red, 0f, 0.9f);
            kpEyeMat.EnableKeyword("_EMISSION");
            kpEyeMat.SetColor("_EmissionColor", Color.red * 3.5f);
            for (int side = -1; side <= 1; side += 2)
            {
                var eye = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                eye.name = side < 0 ? "KingpinEye_L" : "KingpinEye_R";
                eye.transform.SetParent(kingpinGo.transform, false);
                eye.transform.localPosition = new Vector3(side * 0.14f, 0.95f, 1.05f);
                eye.transform.localScale = Vector3.one * 0.08f;
                eye.GetComponent<Renderer>().sharedMaterial = kpEyeMat;
                Object.DestroyImmediate(eye.GetComponent<Collider>());
            }
            kingpinGo.AddComponent<UnityEngine.AI.NavMeshAgent>();
            kingpinGo.AddComponent<KingpinBossAI>();
            kingpinGo.AddComponent<KingpinArenaRig>();

            // 13. Spawn Rat Prey across solid Yard Aprons & DD1 Basin
            var ratSpawns = new[]
            {
                new Vector3(-14f, 0.3f, -10f),
                new Vector3(-22f, 0.3f, 5f),
                new Vector3(-6f, 0.3f, 15f),
                new Vector3(-45f, -3.5f, 45f),   // Inside DD1 basin
                new Vector3(-68f, 0.3f, 65f),    // Apron between DD1 & DD12
                new Vector3(-15f, 0.3f, 85f),    // North East apron
                new Vector3(-159f, 0.3f, 95f),   // Apron between DD2 & DD12
                new Vector3(5f, 0.3f, -35f)
            };
            for (int i = 0; i < ratSpawns.Length; i++)
            {
                var ratGo = new GameObject($"RatPrey_{i + 1}");
                ratGo.transform.SetParent(enemiesRoot.transform, false);
                ratGo.transform.position = ratSpawns[i];
                var col = ratGo.AddComponent<SphereCollider>();
                col.radius = 0.45f;
                col.center = new Vector3(0f, 0.25f, 0f);
                if (ratPrefab != null)
                {
                    var ratWrapper = new GameObject("Rat_ScaleWrapper");
                    ratWrapper.transform.SetParent(ratGo.transform, false);
                    ratWrapper.transform.localRotation = Quaternion.Euler(0f, 180f, 0f); // Snout forward (+Z)
                    ratWrapper.transform.localScale = Vector3.one * 0.22f; // Realistic ~0.44m rat vs Alba

                    var ratMesh = (GameObject)PrefabUtility.InstantiatePrefab(ratPrefab, ratWrapper.transform);
                    ratMesh.name = "Rat_GLB_Model";
                    ratMesh.transform.localPosition = Vector3.zero;
                    if (ratMesh.GetComponent<Animator>() == null)
                        ratMesh.AddComponent<Animator>();

                    var ratAnim = ratGo.AddComponent<RatAnimationDriver>();
                    ratAnim.SetClips(
                        LoadClip("Assets/ShipyardCat/Imported/Models/rat.glb", "Armature|Idle"),
                        LoadClip("Assets/ShipyardCat/Imported/Models/rat.glb", "Armature|Run")
                    );
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

            // 13b. Lieutenant Cobalt Boss on CVN-80 Flight Deck (Tinted Mutant Feline Model)
            var cobaltGo = new GameObject("LieutenantCobalt_Boss");
            cobaltGo.transform.SetParent(enemiesRoot.transform, false);
            cobaltGo.transform.position = new Vector3(-115f, 7.1f, 225f);
            var cbCol = cobaltGo.AddComponent<CapsuleCollider>();
            cbCol.center = new Vector3(0f, 0.6f, 0f);
            cbCol.radius = 0.55f;
            cbCol.height = 1.4f;
            var cobaltMat = CreateSimpleMaterial("CobaltMutantMat", urpLit, new Color(0.08f, 0.24f, 0.55f), 0.3f, 0.6f);
            cobaltMat.EnableKeyword("_EMISSION");
            cobaltMat.SetColor("_EmissionColor", new Color(0.1f, 0.65f, 1.0f) * 1.4f);
            if (catPrefab != null)
            {
                var cbWrap = new GameObject("Cobalt_ScaleWrapper");
                cbWrap.transform.SetParent(cobaltGo.transform, false);
                cbWrap.transform.localScale = Vector3.one * 2.15f;
                var cbMesh = (GameObject)PrefabUtility.InstantiatePrefab(catPrefab, cbWrap.transform);
                cbMesh.name = "Cobalt_GLB_Model";
                foreach (var rend in cbMesh.GetComponentsInChildren<Renderer>(true)) rend.sharedMaterial = cobaltMat;
            }
            cobaltGo.AddComponent<UnityEngine.AI.NavMeshAgent>();
            cobaltGo.AddComponent<LieutenantCobaltBossAI>();

            // 13c. Mutant Cats (Scout, Prowler, Enforcer) with tinted cat silhouettes
            var mutantSpawns = new[]
            {
                (name: "MutantCat_Scout", pos: new Vector3(-95f, 0.3f, 55f)),
                (name: "MutantCat_Prowler", pos: new Vector3(-68f, 0.3f, 125f)),
                (name: "MutantCat_Enforcer", pos: new Vector3(-115f, 7.1f, 190f))
            };
            var mutantMat = CreateSimpleMaterial("MutantCatFeralMat", urpLit, new Color(0.18f, 0.42f, 0.28f), 0.2f, 0.4f);
            mutantMat.EnableKeyword("_EMISSION");
            mutantMat.SetColor("_EmissionColor", new Color(0.15f, 0.9f, 0.35f) * 0.6f);
            foreach (var m in mutantSpawns)
            {
                var mGo = new GameObject(m.name);
                mGo.transform.SetParent(enemiesRoot.transform, false);
                mGo.transform.position = m.pos;
                var mcCol = mGo.AddComponent<CapsuleCollider>();
                mcCol.center = new Vector3(0f, 0.45f, 0f);
                mcCol.radius = 0.4f;
                mcCol.height = 1.0f;
                if (catPrefab != null)
                {
                    var mWrap = new GameObject("Mutant_ScaleWrapper");
                    mWrap.transform.SetParent(mGo.transform, false);
                    mWrap.transform.localScale = Vector3.one * 1.55f;
                    var mMesh = (GameObject)PrefabUtility.InstantiatePrefab(catPrefab, mWrap.transform);
                    mMesh.name = "Mutant_GLB_Model";
                    foreach (var rend in mMesh.GetComponentsInChildren<Renderer>(true)) rend.sharedMaterial = mutantMat;
                }
                mGo.AddComponent<UnityEngine.AI.NavMeshAgent>();
                mGo.AddComponent<MutantCatAI>();
            }

            // 13d. Shipbuilders (Coveralls + Safety Vest + Hardhat), Colony Cats (GLB) & Seagull Flock
            var npcsRoot = new GameObject("ShipyardNPCs");
            npcsRoot.transform.SetParent(worldRoot.transform, false);
            var workerPositions = new[]
            {
                new Vector3(4f, 0.0f, -45f),
                new Vector3(-18f, 0.0f, -25f),
                new Vector3(-36f, -3.9f, 18f),
                new Vector3(-30f, 0.0f, 10f)
            };
            var coverallMat = CreateSimpleMaterial("WorkerCoverallMat", urpLit, new Color(0.12f, 0.16f, 0.24f), 0.1f, 0.25f);
            for (int w = 0; w < workerPositions.Length; w++)
            {
                var wGo = new GameObject($"Shipbuilder_{w + 1}");
                wGo.transform.SetParent(npcsRoot.transform, false);
                wGo.transform.position = workerPositions[w];
                var wCol = wGo.AddComponent<CapsuleCollider>();
                wCol.center = new Vector3(0f, 0.9f, 0f);
                wCol.radius = 0.35f;
                wCol.height = 1.8f;

                var legs = CreateBox("Legs", wGo.transform, new Vector3(0f, 0.45f, 0f), new Vector3(0.42f, 0.9f, 0.26f), coverallMat, false);
                var vest = CreateBox("SafetyVest", wGo.transform, new Vector3(0f, 1.18f, 0f), new Vector3(0.48f, 0.56f, 0.3f), safetyAmberMat, false);
                var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                head.name = "Head";
                head.transform.SetParent(wGo.transform, false);
                head.transform.localPosition = new Vector3(0f, 1.62f, 0f);
                head.transform.localScale = Vector3.one * 0.26f;
                head.GetComponent<Renderer>().sharedMaterial = concreteMat;
                Object.DestroyImmediate(head.GetComponent<Collider>());
                var hardhat = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                hardhat.name = "HardHat";
                hardhat.transform.SetParent(wGo.transform, false);
                hardhat.transform.localPosition = new Vector3(0f, 1.74f, 0f);
                hardhat.transform.localScale = new Vector3(0.32f, 0.08f, 0.34f);
                hardhat.GetComponent<Renderer>().sharedMaterial = safetyAmberMat;
                Object.DestroyImmediate(hardhat.GetComponent<Collider>());
                wGo.AddComponent<ShipbuilderNPC>();
            }
            var colonyMat = CreateSimpleMaterial("ColonyCalicoMat", urpLit, new Color(0.86f, 0.56f, 0.28f), 0.05f, 0.3f);
            for (int c = 0; c < 3; c++)
            {
                var cGo = new GameObject($"ColonyCat_{c + 1}");
                cGo.transform.SetParent(npcsRoot.transform, false);
                cGo.transform.position = new Vector3(16f + c * 1.8f, 0.14f, -26f);
                if (catPrefab != null)
                {
                    var cw = new GameObject("Colony_ScaleWrapper");
                    cw.transform.SetParent(cGo.transform, false);
                    cw.transform.localScale = Vector3.one * 1.3f;
                    var cm = (GameObject)PrefabUtility.InstantiatePrefab(catPrefab, cw.transform);
                    cm.name = "Colony_GLB_Model";
                    foreach (var rend in cm.GetComponentsInChildren<Renderer>(true)) rend.sharedMaterial = colonyMat;
                }
                cGo.AddComponent<ColonyCatNPC>();
            }
            var flockGo = new GameObject("SeagullFlock");
            flockGo.transform.SetParent(worldRoot.transform, false);
            flockGo.transform.position = new Vector3(42f, 16f, 20f);
            flockGo.AddComponent<SeagullFlock>();

            // 13e. Glowing Narrative Collectibles (JMAF, Apprentice School, Gate 4, Cat Motel)
            var pickupsRoot = new GameObject("ShipyardCollectibles");
            pickupsRoot.transform.SetParent(worldRoot.transform, false);
            var collectibleMat = CreateSimpleMaterial("CollectibleGlowMat", urpLit, ShipyardPalette.SonarCyan, 0.3f, 0.9f);
            collectibleMat.EnableKeyword("_EMISSION");
            collectibleMat.SetColor("_EmissionColor", ShipyardPalette.SonarCyan * 2.4f);
            var pickupDefs = new[]
            {
                (id: "jmaf_blueprints", label: "JMAF Reactor Blueprints", obj: "jmaf", pos: new Vector3(-25f, 0.85f, -35f)),
                (id: "apprentice_badge", label: "Apprentice School Wrench Badge", obj: "apprentice", pos: new Vector3(22f, 0.85f, 35f)),
                (id: "gate4_pass", label: "Gate 4 Security Pass", obj: "gate4", pos: new Vector3(8f, 0.85f, -49f)),
                (id: "catmotel_tuna", label: "Cat Motel Tuna Cache", obj: "sanctuary", pos: new Vector3(18f, 0.85f, -28f))
            };
            foreach (var p in pickupDefs)
            {
                var pGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                pGo.name = $"Collectible_{p.id}";
                pGo.transform.SetParent(pickupsRoot.transform, false);
                pGo.transform.position = p.pos;
                pGo.transform.localScale = new Vector3(0.45f, 0.45f, 0.45f);
                pGo.GetComponent<Renderer>().sharedMaterial = collectibleMat;
                Object.DestroyImmediate(pGo.GetComponent<Collider>());
                var ci = pGo.AddComponent<CollectibleItem>();
                ci.Configure(p.id, p.label, p.obj, 150, 25f);
            }

            // 14. UI Toolkit HUD & GameShell Setup
            var panelPath = "Assets/ShipyardCat/Settings/ShipyardPanelSettings.asset";
            var panelSettings = AssetDatabase.LoadAssetAtPath<PanelSettings>(panelPath);
            if (panelSettings == null)
            {
                panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
                panelSettings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                panelSettings.referenceResolution = new Vector2Int(1920, 1080);
                AssetDatabase.CreateAsset(panelSettings, panelPath);
            }
            var defaultTheme = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>("Assets/UI Toolkit/UnityThemes/UnityDefaultRuntimeTheme.tss");
            if (defaultTheme != null)
            {
                panelSettings.themeStyleSheet = defaultTheme;
                EditorUtility.SetDirty(panelSettings);
            }

            var hudGo = new GameObject("ShipyardHUD");
            var uiDoc = hudGo.AddComponent<UIDocument>();
            uiDoc.panelSettings = panelSettings;
            var uxml = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/ShipyardCat/UI/ShipyardHUD.uxml");
            if (uxml != null) uiDoc.visualTreeAsset = uxml;
            var hudCtrl = hudGo.AddComponent<ShipyardHUDController>();
            var shellCtrl = hudGo.AddComponent<GameShellController>();
            shellCtrl.Configure(uiDoc, albaGo.transform, mainCam);

            // Save Scene & Assets
            EditorSceneManager.SaveScene(scene, "Assets/Scenes/ShipyardMain.unity");
            AssetDatabase.SaveAssets();

            return "ShipyardMain.unity assembled: PBR materials, Dry Docks 1/2/12, Fab Super-Shop, NavMesh baked, Alba, Kingpin, 8 Rats, VFX, Audio, and UI Toolkit HUD.";
        }

        private static AnimationClip LoadClip(string assetPath, string clipName)
        {
            AnimationClip found = null;
            var assets = AssetDatabase.LoadAllAssetsAtPath(assetPath);
            foreach (var a in assets)
            {
                if (a is AnimationClip clip && clip.name == clipName)
                {
                    found = clip;
                    break;
                }
            }
            if (found == null)
            {
                foreach (var a in assets)
                {
                    if (a is AnimationClip clip && !clip.name.StartsWith("__preview__") && clip.name.Contains(clipName))
                    {
                        found = clip;
                        break;
                    }
                }
            }
            if (found == null) return null;
            if (!found.legacy) return found;

            // glTFast imports clips as Legacy; clone to non-legacy .anim asset for PlayableGraph/Animator
            EnsureFolder("Assets/ShipyardCat/Animations");
            string safeName = found.name.Replace("|", "_").Replace("/", "_").Replace("\\", "_");
            string animPath = $"Assets/ShipyardCat/Animations/{safeName}.anim";
            var existing = AssetDatabase.LoadAssetAtPath<AnimationClip>(animPath);
            if (existing != null && !existing.legacy)
                return existing;

            var clone = Object.Instantiate(found);
            clone.name = safeName;
            clone.legacy = false;
            AssetDatabase.CreateAsset(clone, animPath);
            return clone;
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

        private static void CreateYardCutoutStrip(string name, Transform parent, float minX, float maxX, float minZ, float maxZ, Material mat)
        {
            float w = maxX - minX;
            float l = maxZ - minZ;
            if (w <= 0.1f || l <= 0.1f) return;
            CreateBox(name, parent, new Vector3((minX + maxX) * 0.5f, -0.5f, (minZ + maxZ) * 0.5f), new Vector3(w, 1f, l), mat);
        }
    }
}
