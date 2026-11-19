using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace ShipyardCat.Editor
{
    public static class YardPropsAndRailBuilder
    {
        private const string RootGroupName = "YardRailsAndProps";

        public static void BuildYardRailsAndProps(Transform worldRoot, Material steelMat, Material safetyAmberMat)
        {
            if (worldRoot != null)
            {
                Transform existing = worldRoot.Find(RootGroupName);
                if (existing != null)
                {
                    Object.DestroyImmediate(existing.gameObject);
                }
            }

            GameObject rootGo = new GameObject(RootGroupName);
            Undo.RegisterCreatedObjectUndo(rootGo, "Build Yard Rails and Props");
            if (worldRoot != null)
            {
                rootGo.transform.SetParent(worldRoot, false);
            }
            rootGo.transform.localPosition = Vector3.zero;
            rootGo.transform.localRotation = Quaternion.identity;

            Shader referenceShader = ResolveLitShader(steelMat, safetyAmberMat);
            Material resolvedSteelMat = steelMat != null
                ? steelMat
                : CreateMaterial(referenceShader, new Color(0.28f, 0.31f, 0.35f), 0.85f, 0.45f);
            Material resolvedAmberMat = safetyAmberMat != null
                ? safetyAmberMat
                : CreateMaterial(referenceShader, new Color(0.95f, 0.58f, 0.05f), 0.25f, 0.55f);

            Material darkWoodTieMat = CreateMaterial(referenceShader, new Color(0.22f, 0.16f, 0.12f), 0.05f, 0.18f);
            Material railSteelMat = CreateMaterial(referenceShader, new Color(0.42f, 0.44f, 0.47f), 0.92f, 0.62f);
            Material rustMat = CreateMaterial(referenceShader, new Color(0.42f, 0.19f, 0.12f), 0.45f, 0.22f);
            Material darkRustMat = CreateMaterial(referenceShader, new Color(0.27f, 0.13f, 0.09f), 0.50f, 0.20f);
            Material navyContainerMat = CreateMaterial(referenceShader, new Color(0.10f, 0.18f, 0.28f), 0.40f, 0.35f);
            Material slatePipeMat = CreateMaterial(referenceShader, new Color(0.36f, 0.40f, 0.44f), 0.80f, 0.50f);
            Material drumDarkMat = CreateMaterial(referenceShader, new Color(0.14f, 0.16f, 0.18f), 0.65f, 0.40f);
            Material tintedGlassMat = CreateMaterial(referenceShader, new Color(0.07f, 0.12f, 0.16f), 0.15f, 0.90f);
            Material concretePadMat = CreateMaterial(referenceShader, new Color(0.32f, 0.33f, 0.34f), 0.0f, 0.15f);
            Material emissiveAmberMat = CreateEmissiveMaterial(referenceShader, new Color(1.0f, 0.62f, 0.08f), 4.5f);

            BuildYardRailway(rootGo.transform, darkWoodTieMat, railSteelMat);
            BuildShipyardRailFlatcar(rootGo.transform, resolvedSteelMat, rustMat, darkRustMat, darkWoodTieMat, resolvedAmberMat);
            BuildShippingContainers(rootGo.transform, navyContainerMat, rustMat, darkRustMat, resolvedSteelMat);
            BuildPipeSpoolRacks(rootGo.transform, resolvedSteelMat, slatePipeMat, resolvedAmberMat, rustMat);
            BuildBarrelClusters(rootGo.transform, resolvedAmberMat, rustMat, drumDarkMat, resolvedSteelMat);
            BuildSecurityWatchtower(
                rootGo.transform,
                resolvedSteelMat,
                resolvedAmberMat,
                concretePadMat,
                tintedGlassMat,
                emissiveAmberMat);
        }

        private static void BuildYardRailway(Transform parent, Material tieMat, Material railMat)
        {
            GameObject railwayGroup = CreateGroup("Yard_Railway", parent, Vector3.zero);

            const float trackCenterX = -18f;
            const float zMin = -60f;
            const float zMax = 80f;
            const float tieSpacing = 2.4f;
            const float railGaugeHalf = 0.75f; // X = -18.75f and X = -17.25f

            GameObject tiesGroup = CreateGroup("Rail_Ties", railwayGroup.transform, Vector3.zero);
            int tieIndex = 0;
            for (float z = zMin; z <= zMax + 0.01f; z += tieSpacing)
            {
                // Y = 0.05f with height 0.08f => bottom at Y = 0.01f (never coplanar with Y = 0.00f)
                CreatePrimitive(
                    PrimitiveType.Cube,
                    $"Rail_Tie_{tieIndex:000}",
                    tiesGroup.transform,
                    new Vector3(trackCenterX, 0.05f, z),
                    new Vector3(2.55f, 0.08f, 0.24f),
                    tieMat,
                    removeCollider: true);
                tieIndex++;
            }

            float railLength = zMax - zMin;
            float railCenterZ = (zMin + zMax) * 0.5f;

            // Twin steel rails at X = -18.75f and X = -17.25f (Y = 0.14f, scaleY = 0.12f, colliders removed)
            CreatePrimitive(
                PrimitiveType.Cube,
                "Rail_West",
                railwayGroup.transform,
                new Vector3(trackCenterX - railGaugeHalf, 0.14f, railCenterZ),
                new Vector3(0.11f, 0.12f, railLength),
                railMat,
                removeCollider: true);

            CreatePrimitive(
                PrimitiveType.Cube,
                "Rail_East",
                railwayGroup.transform,
                new Vector3(trackCenterX + railGaugeHalf, 0.14f, railCenterZ),
                new Vector3(0.11f, 0.12f, railLength),
                railMat,
                removeCollider: true);
        }

        private static void BuildShipyardRailFlatcar(
            Transform parent,
            Material steelMat,
            Material rustMat,
            Material darkRustMat,
            Material deckWoodMat,
            Material safetyAmberMat)
        {
            GameObject flatcar = CreateGroup("Rail_Flatcar", parent, new Vector3(-18f, 0f, 22f));

            // Deck: bottom Y = 1.05f, top Y = 1.45f, size 3.4m x 0.4m x 12m => center Y = 1.25f
            // Clear height underneath between bogies is 1.05m so Alba (0.9m) can prowl directly underneath.
            CreatePrimitive(
                PrimitiveType.Cube,
                "Flatcar_Deck",
                flatcar.transform,
                new Vector3(0f, 1.25f, 0f),
                new Vector3(3.4f, 0.4f, 12.0f),
                rustMat);

            // Side sills / rub rails (flush along upper deck perimeter)
            for (int side = -1; side <= 1; side += 2)
            {
                float xPos = side * 1.72f;
                CreatePrimitive(
                    PrimitiveType.Cube,
                    side < 0 ? "Deck_SideSill_West" : "Deck_SideSill_East",
                    flatcar.transform,
                    new Vector3(xPos, 1.28f, 0f),
                    new Vector3(0.08f, 0.36f, 12.04f),
                    darkRustMat);

                // Stake pockets along side sills
                for (float z = -5.0f; z <= 5.01f; z += 2.5f)
                {
                    CreatePrimitive(
                        PrimitiveType.Cube,
                        $"StakePocket_{(side < 0 ? "W" : "E")}_{z:+0.0;-0.0}",
                        flatcar.transform,
                        new Vector3(side * 1.77f, 1.32f, z),
                        new Vector3(0.09f, 0.24f, 0.16f),
                        safetyAmberMat);
                }
            }

            // Wooden deck plank overlay above deck top (Y = 1.45f -> 1.49f)
            CreatePrimitive(
                PrimitiveType.Cube,
                "Flatcar_DeckPlanking",
                flatcar.transform,
                new Vector3(0f, 1.47f, 0f),
                new Vector3(3.15f, 0.04f, 11.7f),
                deckWoodMat);

            // End buffer beams & couplers at Z = +-6.0m
            for (int end = -1; end <= 1; end += 2)
            {
                string endTag = end < 0 ? "South" : "North";
                CreatePrimitive(
                    PrimitiveType.Cube,
                    $"EndBeam_{endTag}",
                    flatcar.transform,
                    new Vector3(0f, 1.25f, end * 6.04f),
                    new Vector3(3.48f, 0.42f, 0.12f),
                    darkRustMat);

                CreatePrimitive(
                    PrimitiveType.Cube,
                    $"Coupler_Shank_{endTag}",
                    flatcar.transform,
                    new Vector3(0f, 1.08f, end * 6.32f),
                    new Vector3(0.24f, 0.18f, 0.55f),
                    steelMat);

                CreatePrimitive(
                    PrimitiveType.Cube,
                    $"Coupler_Head_{endTag}",
                    flatcar.transform,
                    new Vector3(0f, 1.08f, end * 6.62f),
                    new Vector3(0.36f, 0.24f, 0.24f),
                    darkRustMat);
            }

            // Front and rear bogie assemblies positioned near ends so middle ~6.4m under-deck span stays open
            BuildFlatcarBogie(flatcar.transform, "Bogie_South", -4.35f, steelMat, darkRustMat, rustMat);
            BuildFlatcarBogie(flatcar.transform, "Bogie_North", 4.35f, steelMat, darkRustMat, rustMat);

            // Cargo strapped on flatcar deck (Y >= 1.49f)
            CreatePrimitive(
                PrimitiveType.Cube,
                "Cargo_PlateStack_A",
                flatcar.transform,
                new Vector3(-0.45f, 1.67f, -2.1f),
                new Vector3(1.8f, 0.36f, 4.2f),
                steelMat);

            CreatePrimitive(
                PrimitiveType.Cube,
                "Cargo_Crate_B",
                flatcar.transform,
                new Vector3(0.35f, 1.94f, 2.8f),
                new Vector3(2.0f, 0.90f, 3.0f),
                deckWoodMat);
        }

        private static void BuildFlatcarBogie(
            Transform flatcar,
            string name,
            float localZ,
            Material steelMat,
            Material darkRustMat,
            Material rustMat)
        {
            GameObject bogie = CreateGroup(name, flatcar, new Vector3(0f, 0f, localZ));

            // Rail top is Y = 0.20f. 0.8m diameter wheel => radius 0.40m => axle center Y = 0.60f.
            const float wheelDiameter = 0.80f;
            const float axleY = 0.60f;
            const float wheelGaugeHalf = 0.75f;
            const float axleSpacingHalf = 0.82f;

            // Center bolster connecting bogie up to flatcar deck bottom (Y = 1.05f)
            CreatePrimitive(
                PrimitiveType.Cube,
                "Bogie_Bolster",
                bogie.transform,
                new Vector3(0f, 0.92f, 0f),
                new Vector3(2.10f, 0.26f, 0.60f),
                darkRustMat);

            // Side frames spanning between the two axles
            for (int side = -1; side <= 1; side += 2)
            {
                float frameX = side * 0.98f;
                CreatePrimitive(
                    PrimitiveType.Cube,
                    side < 0 ? "SideFrame_West" : "SideFrame_East",
                    bogie.transform,
                    new Vector3(frameX, 0.70f, 0f),
                    new Vector3(0.16f, 0.28f, 2.20f),
                    rustMat);
            }

            // Two 0.8m-diameter wheelsets per bogie
            for (int axleIdx = -1; axleIdx <= 1; axleIdx += 2)
            {
                float axleZ = axleIdx * axleSpacingHalf;
                string axleTag = axleIdx < 0 ? "Rear" : "Front";

                // Solid axle shaft running East-West (Cylinder rotated 90 deg around Z)
                CreateCylinder(
                    $"Axle_{axleTag}",
                    bogie.transform,
                    new Vector3(0f, axleY, axleZ),
                    Quaternion.Euler(0f, 0f, 90f),
                    new Vector3(0.14f, 0.98f, 0.14f),
                    steelMat);

                for (int side = -1; side <= 1; side += 2)
                {
                    float wheelX = side * wheelGaugeHalf;
                    string sideTag = side < 0 ? "West" : "East";

                    // Main 0.8m wheel tread
                    CreateCylinder(
                        $"Wheel_{axleTag}_{sideTag}",
                        bogie.transform,
                        new Vector3(wheelX, axleY, axleZ),
                        Quaternion.Euler(0f, 0f, 90f),
                        new Vector3(wheelDiameter, 0.07f, wheelDiameter),
                        steelMat);

                    // Inner wheel flange
                    CreateCylinder(
                        $"WheelFlange_{axleTag}_{sideTag}",
                        bogie.transform,
                        new Vector3(wheelX - side * 0.06f, axleY, axleZ),
                        Quaternion.Euler(0f, 0f, 90f),
                        new Vector3(wheelDiameter + 0.06f, 0.02f, wheelDiameter + 0.06f),
                        darkRustMat);
                }
            }
        }

        private static void BuildShippingContainers(
            Transform parent,
            Material navyMat,
            Material rustMat,
            Material darkRustMat,
            Material steelMat)
        {
            GameObject containersGroup = CreateGroup("Shipping_Containers", parent, Vector3.zero);

            // Primary stack near (-25f, 0f, 38f)
            GameObject stackA = CreateGroup("Container_Stack_Alpha", containersGroup.transform, new Vector3(-25f, 0f, 38f));
            BuildCorrugatedContainer(stackA.transform, "Container_Navy_Base", Vector3.zero, 0f, 6.2f, navyMat, steelMat);
            BuildCorrugatedContainer(stackA.transform, "Container_Rust_Top", new Vector3(0.08f, 2.62f, -0.1f), 4f, 6.2f, rustMat, steelMat);

            // Second stack slightly offset behind/west
            GameObject stackB = CreateGroup("Container_Stack_Beta", containersGroup.transform, new Vector3(-28.4f, 0f, 37.4f));
            stackB.transform.localRotation = Quaternion.Euler(0f, -6f, 0f);
            BuildCorrugatedContainer(stackB.transform, "Container_DarkRust_Base", Vector3.zero, 0f, 6.2f, darkRustMat, steelMat);
            BuildCorrugatedContainer(stackB.transform, "Container_Navy_Top", new Vector3(-0.05f, 2.62f, 0.12f), -3f, 6.2f, navyMat, steelMat);

            // North yard stack
            GameObject stackC = CreateGroup("Container_Stack_Gamma", containersGroup.transform, new Vector3(-26.2f, 0f, 46.5f));
            stackC.transform.localRotation = Quaternion.Euler(0f, 12f, 0f);
            BuildCorrugatedContainer(stackC.transform, "Container_Rust_Long", Vector3.zero, 0f, 9.2f, rustMat, steelMat);
        }

        private static void BuildCorrugatedContainer(
            Transform parent,
            string name,
            Vector3 localPos,
            float yawDegrees,
            float length,
            Material bodyMat,
            Material trimMat)
        {
            const float width = 2.45f;
            const float height = 2.58f;
            // Base clearance 0.04f above ground so container bottom is never coplanar with Y = 0.00f
            const float footHeight = 0.04f;

            GameObject container = CreateGroup(name, parent, localPos);
            container.transform.localRotation = Quaternion.Euler(0f, yawDegrees, 0f);

            // Corner casting feet
            float halfW = width * 0.5f - 0.14f;
            float halfL = length * 0.5f - 0.14f;
            for (int sx = -1; sx <= 1; sx += 2)
            {
                for (int sz = -1; sz <= 1; sz += 2)
                {
                    CreatePrimitive(
                        PrimitiveType.Cube,
                        "CornerFoot",
                        container.transform,
                        new Vector3(sx * halfW, footHeight * 0.5f + 0.01f, sz * halfL),
                        new Vector3(0.26f, footHeight, 0.26f),
                        trimMat,
                        removeCollider: true);
                }
            }

            // Main container shell
            float bodyCenterY = footHeight + height * 0.5f;
            CreatePrimitive(
                PrimitiveType.Cube,
                "Container_Body",
                container.transform,
                new Vector3(0f, bodyCenterY, 0f),
                new Vector3(width, height, length),
                bodyMat);

            // Corrugated vertical ribs along both long sides (visual detail, no colliders)
            float ribStartZ = -length * 0.5f + 0.35f;
            float ribEndZ = length * 0.5f - 0.35f;
            for (float z = ribStartZ; z <= ribEndZ; z += 0.38f)
            {
                for (int side = -1; side <= 1; side += 2)
                {
                    CreatePrimitive(
                        PrimitiveType.Cube,
                        "Rib",
                        container.transform,
                        new Vector3(side * (width * 0.5f + 0.025f), bodyCenterY, z),
                        new Vector3(0.05f, height - 0.22f, 0.12f),
                        bodyMat,
                        removeCollider: true);
                }
            }

            // End door locking bars
            for (int bar = -1; bar <= 1; bar += 2)
            {
                CreatePrimitive(
                    PrimitiveType.Cube,
                    "DoorLockBar",
                    container.transform,
                    new Vector3(bar * 0.35f, bodyCenterY, -length * 0.5f - 0.03f),
                    new Vector3(0.06f, height - 0.28f, 0.06f),
                    trimMat,
                    removeCollider: true);
            }
        }

        private static void BuildPipeSpoolRacks(
            Transform parent,
            Material steelMat,
            Material pipeMat,
            Material safetyAmberMat,
            Material rustMat)
        {
            GameObject racksGroup = CreateGroup("Pipe_Spool_Racks", parent, Vector3.zero);

            BuildSinglePipeRack(racksGroup.transform, "PipeSpool_Rack_South", new Vector3(-8f, 0f, 32f), 0f, steelMat, pipeMat, safetyAmberMat);
            BuildSinglePipeRack(racksGroup.transform, "PipeSpool_Rack_North", new Vector3(-7.6f, 0f, 39.5f), 8f, steelMat, rustMat, safetyAmberMat);
        }

        private static void BuildSinglePipeRack(
            Transform parent,
            string name,
            Vector3 position,
            float yawDegrees,
            Material frameMat,
            Material pipeMat,
            Material capMat)
        {
            GameObject rack = CreateGroup(name, parent, position);
            rack.transform.localRotation = Quaternion.Euler(0f, yawDegrees, 0f);

            const float rackWidth = 2.8f;
            const float rackHeight = 2.15f;

            // Two H-frame stanchions spaced 3.4m apart along Z
            for (int end = -1; end <= 1; end += 2)
            {
                float zPos = end * 1.7f;
                for (int side = -1; side <= 1; side += 2)
                {
                    float xPos = side * (rackWidth * 0.5f);
                    // Vertical post (sunk slightly at bottom -0.02f so never coplanar with Y = 0.00f)
                    CreatePrimitive(
                        PrimitiveType.Cube,
                        "Rack_Post",
                        rack.transform,
                        new Vector3(xPos, rackHeight * 0.5f, zPos),
                        new Vector3(0.16f, rackHeight + 0.04f, 0.16f),
                        frameMat);

                    // Foot baseplate raised cleanly above Y = 0.00f
                    CreatePrimitive(
                        PrimitiveType.Cube,
                        "Rack_Foot",
                        rack.transform,
                        new Vector3(xPos, 0.03f, zPos),
                        new Vector3(0.32f, 0.04f, 0.32f),
                        capMat);
                }

                // Crossbars at two pipe storage tiers
                CreatePrimitive(
                    PrimitiveType.Cube,
                    "TierBar_Low",
                    rack.transform,
                    new Vector3(0f, 0.62f, zPos),
                    new Vector3(rackWidth + 0.16f, 0.14f, 0.16f),
                    frameMat);

                CreatePrimitive(
                    PrimitiveType.Cube,
                    "TierBar_High",
                    rack.transform,
                    new Vector3(0f, 1.48f, zPos),
                    new Vector3(rackWidth + 0.16f, 0.14f, 0.16f),
                    frameMat);
            }

            // Bottom tier pipes (large diameter)
            float[] lowPipeXs = { -0.85f, 0.0f, 0.85f };
            for (int i = 0; i < lowPipeXs.Length; i++)
            {
                BuildPipeSpool(rack.transform, $"Pipe_Low_{i}", new Vector3(lowPipeXs[i], 0.94f, 0f), 0.50f, 5.4f, pipeMat, capMat);
            }

            // Upper tier pipes (medium diameter)
            float[] highPipeXs = { -0.90f, -0.30f, 0.30f, 0.90f };
            for (int i = 0; i < highPipeXs.Length; i++)
            {
                BuildPipeSpool(rack.transform, $"Pipe_High_{i}", new Vector3(highPipeXs[i], 1.74f, 0f), 0.38f, 5.0f, pipeMat, capMat);
            }
        }

        private static void BuildPipeSpool(
            Transform parent,
            string name,
            Vector3 localPos,
            float diameter,
            float length,
            Material pipeMat,
            Material flangeMat)
        {
            GameObject spool = CreateGroup(name, parent, localPos);

            CreateCylinder(
                "Pipe_Body",
                spool.transform,
                Vector3.zero,
                Quaternion.Euler(90f, 0f, 0f),
                new Vector3(diameter, length * 0.5f, diameter),
                pipeMat);

            for (int end = -1; end <= 1; end += 2)
            {
                CreateCylinder(
                    end < 0 ? "Flange_South" : "Flange_North",
                    spool.transform,
                    new Vector3(0f, 0f, end * (length * 0.5f - 0.04f)),
                    Quaternion.Euler(90f, 0f, 0f),
                    new Vector3(diameter + 0.10f, 0.05f, diameter + 0.10f),
                    flangeMat,
                    removeCollider: true);
            }
        }

        private static void BuildBarrelClusters(
            Transform parent,
            Material safetyAmberMat,
            Material rustMat,
            Material drumDarkMat,
            Material steelMat)
        {
            GameObject barrelsGroup = CreateGroup("Hazard_Drum_Clusters", parent, Vector3.zero);
            int barrelIndex = 1;

            // Cluster 1: Near pipe spool racks
            Vector3[] rackCluster =
            {
                new Vector3(-5.1f, 0f, 29.4f),
                new Vector3(-4.4f, 0f, 29.8f),
                new Vector3(-5.0f, 0f, 30.2f),
                new Vector3(-4.3f, 0f, 30.6f)
            };
            Material[] rackMats = { safetyAmberMat, drumDarkMat, safetyAmberMat, rustMat };
            for (int i = 0; i < rackCluster.Length; i++)
            {
                BuildHazardBarrel(barrelsGroup.transform, $"Barrel_{barrelIndex++:00}", rackCluster[i], rackMats[i], steelMat, tipped: i == 3);
            }

            // Cluster 2: Near shipping containers
            Vector3[] containerCluster =
            {
                new Vector3(-21.6f, 0f, 34.4f),
                new Vector3(-22.3f, 0f, 34.8f),
                new Vector3(-21.7f, 0f, 35.2f),
                new Vector3(-22.5f, 0f, 33.9f),
                new Vector3(-21.1f, 0f, 35.6f)
            };
            Material[] containerMats = { safetyAmberMat, rustMat, safetyAmberMat, drumDarkMat, rustMat };
            for (int i = 0; i < containerCluster.Length; i++)
            {
                BuildHazardBarrel(barrelsGroup.transform, $"Barrel_{barrelIndex++:00}", containerCluster[i], containerMats[i], steelMat, tipped: false);
            }

            // Cluster 3: Near security watchtower base
            Vector3[] towerCluster =
            {
                new Vector3(-68.6f, 0f, -11.8f),
                new Vector3(-67.9f, 0f, -12.3f),
                new Vector3(-68.3f, 0f, -12.9f)
            };
            Material[] towerMats = { safetyAmberMat, safetyAmberMat, drumDarkMat };
            for (int i = 0; i < towerCluster.Length; i++)
            {
                BuildHazardBarrel(barrelsGroup.transform, $"Barrel_{barrelIndex++:00}", towerCluster[i], towerMats[i], steelMat, tipped: false);
            }
        }

        private static void BuildHazardBarrel(
            Transform parent,
            string name,
            Vector3 worldPos,
            Material bodyMat,
            Material rimMat,
            bool tipped)
        {
            const float diameter = 0.58f;
            const float height = 0.88f;

            GameObject barrel = CreateGroup(name, parent, worldPos);
            if (tipped)
            {
                barrel.transform.localPosition = new Vector3(worldPos.x, diameter * 0.5f + 0.01f, worldPos.z);
                barrel.transform.localRotation = Quaternion.Euler(90f, 32f, 0f);
            }

            // Upright center Y = 0.45f => bottom at Y = 0.01f (not coplanar with Y = 0.00f)
            float centerY = tipped ? 0f : height * 0.5f + 0.01f;
            CreateCylinder(
                "Drum_Body",
                barrel.transform,
                new Vector3(0f, centerY, 0f),
                Quaternion.identity,
                new Vector3(diameter, height * 0.5f, diameter),
                bodyMat);

            // Top and bottom rolling chime hoops
            float[] hoopOffsets = { -0.28f, 0.28f };
            for (int i = 0; i < hoopOffsets.Length; i++)
            {
                CreateCylinder(
                    $"Drum_Hoop_{i}",
                    barrel.transform,
                    new Vector3(0f, centerY + hoopOffsets[i], 0f),
                    Quaternion.identity,
                    new Vector3(diameter + 0.03f, 0.025f, diameter + 0.03f),
                    rimMat,
                    removeCollider: true);
            }
        }

        private static void BuildSecurityWatchtower(
            Transform parent,
            Material steelMat,
            Material safetyAmberMat,
            Material concretePadMat,
            Material glassMat,
            Material emissiveAmberMat)
        {
            GameObject tower = CreateGroup("Security_Watchtower", parent, new Vector3(-72f, 0f, -15f));

            const float baseHalfSpan = 2.1f;
            const float topHalfSpan = 1.6f;
            const float platformY = 12.0f;
            const float platformSize = 4.2f;

            Vector3[] bottomCorners =
            {
                new Vector3(-baseHalfSpan, 0.10f, -baseHalfSpan),
                new Vector3( baseHalfSpan, 0.10f, -baseHalfSpan),
                new Vector3( baseHalfSpan, 0.10f,  baseHalfSpan),
                new Vector3(-baseHalfSpan, 0.10f,  baseHalfSpan)
            };
            Vector3[] topCorners =
            {
                new Vector3(-topHalfSpan, platformY, -topHalfSpan),
                new Vector3( topHalfSpan, platformY, -topHalfSpan),
                new Vector3( topHalfSpan, platformY,  topHalfSpan),
                new Vector3(-topHalfSpan, platformY,  topHalfSpan)
            };

            // Concrete plinth footings (bottom sunk to Y = -0.05f, top at Y = 0.25f to avoid coplanar overlap)
            for (int i = 0; i < 4; i++)
            {
                CreatePrimitive(
                    PrimitiveType.Cube,
                    $"Tower_Footing_{i}",
                    tower.transform,
                    new Vector3(bottomCorners[i].x, 0.10f, bottomCorners[i].z),
                    new Vector3(0.75f, 0.30f, 0.75f),
                    concretePadMat);

                BuildStrut(
                    $"Tower_Leg_{i}",
                    tower.transform,
                    bottomCorners[i],
                    topCorners[i],
                    0.22f,
                    steelMat);
            }

            // Horizontal & X-bracing across 3 structural tiers
            float[] tierHeights = { 0.25f, 4.0f, 8.0f, platformY };
            for (int t = 0; t < tierHeights.Length - 1; t++)
            {
                float t0 = tierHeights[t] / platformY;
                float t1 = tierHeights[t + 1] / platformY;

                for (int edge = 0; edge < 4; edge++)
                {
                    int next = (edge + 1) % 4;
                    Vector3 a0 = Vector3.Lerp(bottomCorners[edge], topCorners[edge], t0);
                    Vector3 b0 = Vector3.Lerp(bottomCorners[next], topCorners[next], t0);
                    Vector3 a1 = Vector3.Lerp(bottomCorners[edge], topCorners[edge], t1);
                    Vector3 b1 = Vector3.Lerp(bottomCorners[next], topCorners[next], t1);

                    BuildStrut($"Girt_T{t}_E{edge}", tower.transform, a1, b1, 0.12f, steelMat, removeCollider: true);
                    BuildStrut($"DiagA_T{t}_E{edge}", tower.transform, a0, b1, 0.09f, steelMat, removeCollider: true);
                    BuildStrut($"DiagB_T{t}_E{edge}", tower.transform, b0, a1, 0.09f, steelMat, removeCollider: true);
                }
            }

            // Elevated observation deck
            CreatePrimitive(
                PrimitiveType.Cube,
                "Watchtower_Deck",
                tower.transform,
                new Vector3(0f, platformY + 0.12f, 0f),
                new Vector3(platformSize, 0.24f, platformSize),
                steelMat);

            // Safety amber perimeter guardrails
            float railHalf = platformSize * 0.5f - 0.08f;
            float railBaseY = platformY + 0.24f;
            for (int side = 0; side < 4; side++)
            {
                bool alongX = side % 2 == 0;
                float sign = side < 2 ? -1f : 1f;
                Vector3 railCenter = alongX
                    ? new Vector3(0f, railBaseY + 0.95f, sign * railHalf)
                    : new Vector3(sign * railHalf, railBaseY + 0.95f, 0f);
                Vector3 railScale = alongX
                    ? new Vector3(platformSize, 0.08f, 0.08f)
                    : new Vector3(0.08f, 0.08f, platformSize);

                CreatePrimitive(
                    PrimitiveType.Cube,
                    $"Deck_TopRail_{side}",
                    tower.transform,
                    railCenter,
                    railScale,
                    safetyAmberMat);

                CreatePrimitive(
                    PrimitiveType.Cube,
                    $"Deck_MidRail_{side}",
                    tower.transform,
                    railCenter - new Vector3(0f, 0.45f, 0f),
                    railScale * 0.98f,
                    safetyAmberMat,
                    removeCollider: true);
            }

            // Observation cabin
            float cabinBaseY = railBaseY;
            const float cabinHeight = 2.65f;
            CreatePrimitive(
                PrimitiveType.Cube,
                "Watchtower_CabinBody",
                tower.transform,
                new Vector3(0f, cabinBaseY + cabinHeight * 0.5f, 0f),
                new Vector3(2.8f, cabinHeight, 2.8f),
                steelMat);

            // Observation windows band
            CreatePrimitive(
                PrimitiveType.Cube,
                "Watchtower_Windows",
                tower.transform,
                new Vector3(0f, cabinBaseY + 1.55f, 0f),
                new Vector3(2.86f, 0.95f, 2.86f),
                glassMat,
                removeCollider: true);

            // Overhanging roof & safety amber fascia
            float roofY = cabinBaseY + cabinHeight + 0.14f;
            CreatePrimitive(
                PrimitiveType.Cube,
                "Watchtower_Roof",
                tower.transform,
                new Vector3(0f, roofY, 0f),
                new Vector3(3.45f, 0.24f, 3.45f),
                steelMat);

            CreatePrimitive(
                PrimitiveType.Cube,
                "Watchtower_RoofTrim",
                tower.transform,
                new Vector3(0f, roofY - 0.10f, 0f),
                new Vector3(3.52f, 0.08f, 3.52f),
                safetyAmberMat,
                removeCollider: true);

            // Access ladder on East face
            float ladderX = 1.95f;
            for (int rail = -1; rail <= 1; rail += 2)
            {
                CreatePrimitive(
                    PrimitiveType.Cube,
                    rail < 0 ? "Ladder_Rail_S" : "Ladder_Rail_N",
                    tower.transform,
                    new Vector3(ladderX, platformY * 0.5f + 0.15f, rail * 0.25f),
                    new Vector3(0.06f, platformY + 0.4f, 0.06f),
                    safetyAmberMat,
                    removeCollider: true);
            }
            for (float y = 0.5f; y <= platformY; y += 0.42f)
            {
                CreatePrimitive(
                    PrimitiveType.Cube,
                    $"Ladder_Rung_{y:0.0}",
                    tower.transform,
                    new Vector3(ladderX, y, 0f),
                    new Vector3(0.04f, 0.04f, 0.50f),
                    safetyAmberMat,
                    removeCollider: true);
            }

            // Glowing Amber Beacon on roof
            float beaconBaseY = roofY + 0.12f;
            CreateCylinder(
                "Beacon_Mast",
                tower.transform,
                new Vector3(0f, beaconBaseY + 0.35f, 0f),
                Quaternion.identity,
                new Vector3(0.18f, 0.35f, 0.18f),
                steelMat,
                removeCollider: true);

            GameObject beaconLens = CreatePrimitive(
                PrimitiveType.Sphere,
                "Beacon_AmberGlow",
                tower.transform,
                new Vector3(0f, beaconBaseY + 0.85f, 0f),
                new Vector3(0.42f, 0.48f, 0.42f),
                emissiveAmberMat,
                removeCollider: true);

            Light beaconLight = beaconLens.AddComponent<Light>();
            beaconLight.type = LightType.Point;
            beaconLight.color = new Color(1.0f, 0.62f, 0.08f);
            beaconLight.intensity = 18f;
            beaconLight.range = 32f;
        }

        private static GameObject CreateGroup(string name, Transform parent, Vector3 localPosition)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.transform.localRotation = Quaternion.identity;
            return go;
        }

        private static GameObject CreatePrimitive(
            PrimitiveType type,
            string name,
            Transform parent,
            Vector3 localPosition,
            Vector3 localScale,
            Material material,
            bool removeCollider = false)
        {
            GameObject go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.transform.localRotation = Quaternion.identity;
            go.transform.localScale = localScale;

            MeshRenderer renderer = go.GetComponent<MeshRenderer>();
            if (renderer != null && material != null)
            {
                renderer.sharedMaterial = material;
            }

            if (removeCollider)
            {
                Collider col = go.GetComponent<Collider>();
                if (col != null)
                {
                    Object.DestroyImmediate(col);
                }
            }

            return go;
        }

        private static GameObject CreateCylinder(
            string name,
            Transform parent,
            Vector3 localPosition,
            Quaternion localRotation,
            Vector3 localScale,
            Material material,
            bool removeCollider = false)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.transform.localRotation = localRotation;
            go.transform.localScale = localScale;

            MeshRenderer renderer = go.GetComponent<MeshRenderer>();
            if (renderer != null && material != null)
            {
                renderer.sharedMaterial = material;
            }

            if (removeCollider)
            {
                Collider col = go.GetComponent<Collider>();
                if (col != null)
                {
                    Object.DestroyImmediate(col);
                }
            }

            return go;
        }

        private static void BuildStrut(
            string name,
            Transform parent,
            Vector3 start,
            Vector3 end,
            float thickness,
            Material material,
            bool removeCollider = false)
        {
            Vector3 delta = end - start;
            float length = delta.magnitude;
            if (length < 0.001f)
            {
                return;
            }

            GameObject go = CreatePrimitive(
                PrimitiveType.Cube,
                name,
                parent,
                (start + end) * 0.5f,
                new Vector3(thickness, thickness, length),
                material,
                removeCollider);
            go.transform.localRotation = Quaternion.LookRotation(delta.normalized, Vector3.up);
        }

        private static Shader ResolveLitShader(Material steelMat, Material safetyAmberMat)
        {
            if (steelMat != null && steelMat.shader != null)
            {
                return steelMat.shader;
            }

            if (safetyAmberMat != null && safetyAmberMat.shader != null)
            {
                return safetyAmberMat.shader;
            }

            Shader urpLit = Shader.Find("Universal Render Pipeline/Lit");
            if (urpLit != null)
            {
                return urpLit;
            }

            Shader standard = Shader.Find("Standard");
            return standard != null ? standard : Shader.Find("Diffuse");
        }

        private static Material CreateMaterial(Shader shader, Color albedo, float metallic, float smoothness)
        {
            Material mat = new Material(shader);
            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", albedo);
            }
            if (mat.HasProperty("_Color"))
            {
                mat.SetColor("_Color", albedo);
            }
            if (mat.HasProperty("_Metallic"))
            {
                mat.SetFloat("_Metallic", metallic);
            }
            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", smoothness);
            }
            if (mat.HasProperty("_Glossiness"))
            {
                mat.SetFloat("_Glossiness", smoothness);
            }
            return mat;
        }

        private static Material CreateEmissiveMaterial(Shader shader, Color emissionColor, float intensity)
        {
            Material mat = CreateMaterial(shader, emissionColor, 0.0f, 0.85f);
            mat.EnableKeyword("_EMISSION");
            if (mat.HasProperty("_EmissionColor"))
            {
                mat.SetColor("_EmissionColor", emissionColor * intensity);
            }
            return mat;
        }
    }
}
