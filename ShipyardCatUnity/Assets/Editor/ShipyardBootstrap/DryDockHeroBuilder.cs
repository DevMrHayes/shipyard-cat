using UnityEngine;
using UnityEditor;

namespace ShipyardCat.Editor
{
    public static class DryDockHeroBuilder
    {
        private const string HeroGroupName = "DD1_HeroDetails";

        // Dry Dock 1 reference bounds
        private const float DD1CenterX = -45f;
        private const float DD1CenterZ = 25f;
        private const float DD1FloorY = -3.9f;
        private const float DD1Width = 22f;   // X: [-56, -34]
        private const float DD1Length = 72f;  // Z: [-11, 61]

        private const float DD1MinX = DD1CenterX - DD1Width * 0.5f;  // -56f
        private const float DD1MaxX = DD1CenterX + DD1Width * 0.5f;  // -34f
        private const float DD1MinZ = DD1CenterZ - DD1Length * 0.5f; // -11f
        private const float DD1MaxZ = DD1CenterZ + DD1Length * 0.5f; //  61f

        public static void BuildDryDockHeroDetails(
            Transform walkableRoot,
            Material concreteMat,
            Material steelMat,
            Material safetyAmberMat)
        {
            if (walkableRoot == null)
            {
                Debug.LogError("[DryDockHeroBuilder] walkableRoot is null.");
                return;
            }

            // Remove existing hero details group for idempotent rebuilds
            Transform existing = walkableRoot.Find(HeroGroupName);
            if (existing != null)
            {
                Object.DestroyImmediate(existing.gameObject);
            }

            GameObject heroRootObj = new GameObject(HeroGroupName);
            heroRootObj.transform.SetParent(walkableRoot, false);
            Transform heroRoot = heroRootObj.transform;

            // Ensure fallback materials if any input is null
            Material safeConcreteMat = concreteMat != null
                ? concreteMat
                : CreateUrpLitMaterial("Mat_DD1_ConcreteFallback", new Color(0.45f, 0.46f, 0.47f), 0f, 0.2f);
            Material safeSteelMat = steelMat != null
                ? steelMat
                : CreateUrpLitMaterial("Mat_DD1_SteelFallback", new Color(0.28f, 0.31f, 0.34f), 0.85f, 0.55f);
            Material safeAmberMat = safetyAmberMat != null
                ? safetyAmberMat
                : CreateUrpLitMaterial("Mat_DD1_SafetyAmberFallback", new Color(0.95f, 0.68f, 0.06f), 0.2f, 0.45f);

            Material hazardBlackMat = CreateUrpLitMaterial("Mat_DD1_HazardBlack", new Color(0.08f, 0.08f, 0.09f), 0.1f, 0.35f);
            Material keelTimberMat = CreateUrpLitMaterial("Mat_KeelTimber", new Color(0.32f, 0.20f, 0.11f), 0.0f, 0.18f);
            Material sumpWaterMat = CreateToxicSumpMaterial("Mat_DD1_ToxicSump", "#2A6826");
            Material valveRedMat = CreateUrpLitMaterial("Mat_DD1_ValveRed", new Color(0.68f, 0.12f, 0.10f), 0.35f, 0.5f);

            BuildCopingHazardStriping(heroRoot, hazardBlackMat, safeAmberMat);
            BuildKeelCribbing(heroRoot, keelTimberMat);
            BuildToxicDrainageSump(heroRoot, safeConcreteMat, sumpWaterMat);
            BuildWestRimPipeManifold(heroRoot, safeSteelMat, safeAmberMat, valveRedMat);
            BuildElevatedCatwalk(heroRoot, safeSteelMat, safeAmberMat);

            EditorUtility.SetDirty(walkableRoot.gameObject);
        }

        // 1) Alternating black-and-amber hazard striping blocks on DD1 coping edge
        private static void BuildCopingHazardStriping(Transform parent, Material blackMat, Material amberMat)
        {
            GameObject group = CreateChildGroup("DD1_HazardStriping", parent);

            const float tileY = 0.13f;
            const float tileHeight = 0.04f; // Top at 0.15f (never coplanar with Y = 0.00f)
            const float tileLength = 1.0f;
            const float tileWidth = 0.36f;
            const float copingInset = 0.22f;

            int index = 0;

            // West & East coping edges (along Z)
            for (float z = DD1MinZ + 0.5f; z <= DD1MaxZ - 0.5f; z += tileLength)
            {
                Material mat = (index % 2 == 0) ? amberMat : blackMat;

                CreatePrimitive(
                    $"DD1_HazardTile_{index:D3}_W",
                    PrimitiveType.Cube,
                    group.transform,
                    new Vector3(DD1MinX - copingInset, tileY, z),
                    Quaternion.identity,
                    new Vector3(tileWidth, tileHeight, tileLength * 0.96f),
                    mat,
                    removeCollider: true);

                CreatePrimitive(
                    $"DD1_HazardTile_{index:D3}_E",
                    PrimitiveType.Cube,
                    group.transform,
                    new Vector3(DD1MaxX + copingInset, tileY, z),
                    Quaternion.identity,
                    new Vector3(tileWidth, tileHeight, tileLength * 0.96f),
                    mat,
                    removeCollider: true);

                index++;
            }

            // South & North coping edges (along X)
            for (float x = DD1MinX + 0.5f; x <= DD1MaxX - 0.5f; x += tileLength)
            {
                Material mat = (index % 2 == 0) ? amberMat : blackMat;

                CreatePrimitive(
                    $"DD1_HazardTile_{index:D3}_S",
                    PrimitiveType.Cube,
                    group.transform,
                    new Vector3(x, tileY, DD1MinZ - copingInset),
                    Quaternion.identity,
                    new Vector3(tileLength * 0.96f, tileHeight, tileWidth),
                    mat,
                    removeCollider: true);

                CreatePrimitive(
                    $"DD1_HazardTile_{index:D3}_N",
                    PrimitiveType.Cube,
                    group.transform,
                    new Vector3(x, tileY, DD1MaxZ + copingInset),
                    Quaternion.identity,
                    new Vector3(tileLength * 0.96f, tileHeight, tileWidth),
                    mat,
                    removeCollider: true);

                index++;
            }
        }

        // 2) Heavy timber keel cribbing stacks along DD1 floor (-45f, -3.55f, 5f..42f)
        private static void BuildKeelCribbing(Transform parent, Material timberMat)
        {
            GameObject group = CreateChildGroup("DD1_KeelCribbing", parent);

            const float centerX = DD1CenterX; // -45f
            const float centerY = -3.55f;     // Floor at -3.90f -> stack height 0.70f [-3.90, -3.20]
            const float startZ = 5f;
            const float endZ = 42f;
            const float spacingZ = 3.7f;

            int stackIndex = 0;
            for (float z = startZ; z <= endZ + 0.01f; z += spacingZ)
            {
                GameObject stackObj = CreateChildGroup($"DD1_KeelCrib_{stackIndex:D2}", group.transform);
                stackObj.transform.position = new Vector3(centerX, centerY, z);

                // Lower cross-ties resting on floor (Y: -3.90 to -3.66)
                CreatePrimitive(
                    "LowerTie_S",
                    PrimitiveType.Cube,
                    stackObj.transform,
                    new Vector3(centerX, DD1FloorY + 0.12f, z - 0.42f),
                    Quaternion.identity,
                    new Vector3(2.8f, 0.24f, 0.32f),
                    timberMat,
                    removeCollider: false);

                CreatePrimitive(
                    "LowerTie_N",
                    PrimitiveType.Cube,
                    stackObj.transform,
                    new Vector3(centerX, DD1FloorY + 0.12f, z + 0.42f),
                    Quaternion.identity,
                    new Vector3(2.8f, 0.24f, 0.32f),
                    timberMat,
                    removeCollider: false);

                // Middle longitudinal beams (Y: -3.66 to -3.44)
                CreatePrimitive(
                    "MidBeam_W",
                    PrimitiveType.Cube,
                    stackObj.transform,
                    new Vector3(centerX - 0.72f, DD1FloorY + 0.35f, z),
                    Quaternion.identity,
                    new Vector3(0.36f, 0.22f, 1.35f),
                    timberMat,
                    removeCollider: false);

                CreatePrimitive(
                    "MidBeam_C",
                    PrimitiveType.Cube,
                    stackObj.transform,
                    new Vector3(centerX, DD1FloorY + 0.35f, z),
                    Quaternion.identity,
                    new Vector3(0.42f, 0.22f, 1.35f),
                    timberMat,
                    removeCollider: false);

                CreatePrimitive(
                    "MidBeam_E",
                    PrimitiveType.Cube,
                    stackObj.transform,
                    new Vector3(centerX + 0.72f, DD1FloorY + 0.35f, z),
                    Quaternion.identity,
                    new Vector3(0.36f, 0.22f, 1.35f),
                    timberMat,
                    removeCollider: false);

                // Top cap keel block (Y: -3.44 to -3.20)
                CreatePrimitive(
                    "TopKeelCap",
                    PrimitiveType.Cube,
                    stackObj.transform,
                    new Vector3(centerX, DD1FloorY + 0.58f, z),
                    Quaternion.identity,
                    new Vector3(2.15f, 0.24f, 0.68f),
                    timberMat,
                    removeCollider: false);

                stackIndex++;
            }
        }

        // 3) Glowing toxic-green drainage sump trench/puddle along DD1 floor (-40f, -3.86f, 20f..48f)
        private static void BuildToxicDrainageSump(Transform parent, Material curbMat, Material sumpMat)
        {
            GameObject group = CreateChildGroup("DD1_ToxicSump", parent);

            const float sumpX = -40f;
            const float sumpY = -3.86f;
            const float startZ = 20f;
            const float endZ = 48f;
            float lengthZ = endZ - startZ;          // 28f
            float centerZ = (startZ + endZ) * 0.5f; // 34f
            const float puddleWidth = 1.45f;

            // Glowing emissive puddle surface (collider removed)
            CreatePrimitive(
                "DD1_ToxicSump_Puddle",
                PrimitiveType.Cube,
                group.transform,
                new Vector3(sumpX, sumpY, centerZ),
                Quaternion.identity,
                new Vector3(puddleWidth, 0.04f, lengthZ),
                sumpMat,
                removeCollider: true);

            // Low concrete trench curbs flanking the sump channel
            const float curbHeight = 0.08f;
            float curbY = DD1FloorY + curbHeight * 0.5f;
            float curbOffsetX = puddleWidth * 0.5f + 0.11f;

            CreatePrimitive(
                "DD1_SumpCurb_W",
                PrimitiveType.Cube,
                group.transform,
                new Vector3(sumpX - curbOffsetX, curbY, centerZ),
                Quaternion.identity,
                new Vector3(0.22f, curbHeight, lengthZ + 0.44f),
                curbMat,
                removeCollider: true);

            CreatePrimitive(
                "DD1_SumpCurb_E",
                PrimitiveType.Cube,
                group.transform,
                new Vector3(sumpX + curbOffsetX, curbY, centerZ),
                Quaternion.identity,
                new Vector3(0.22f, curbHeight, lengthZ + 0.44f),
                curbMat,
                removeCollider: true);

            CreatePrimitive(
                "DD1_SumpCurb_S",
                PrimitiveType.Cube,
                group.transform,
                new Vector3(sumpX, curbY, startZ - 0.11f),
                Quaternion.identity,
                new Vector3(puddleWidth, curbHeight, 0.22f),
                curbMat,
                removeCollider: true);

            CreatePrimitive(
                "DD1_SumpCurb_N",
                PrimitiveType.Cube,
                group.transform,
                new Vector3(sumpX, curbY, endZ + 0.11f),
                Quaternion.identity,
                new Vector3(puddleWidth, curbHeight, 0.22f),
                curbMat,
                removeCollider: true);
        }

        // 4) Industrial steel pipe & valve manifold along DD1 West rim (-64f, 0.55f, 15f) with handwheel discs
        private static void BuildWestRimPipeManifold(
            Transform parent,
            Material steelMat,
            Material amberMat,
            Material valveRedMat)
        {
            GameObject group = CreateChildGroup("DD1_WestPipeManifold", parent);

            const float baseX = -64f;
            const float baseY = 0.55f;
            const float baseZ = 15f;

            // Concrete/steel mounting plinth (top at Y = 0.22f, never coplanar with Y = 0.00f)
            CreatePrimitive(
                "Manifold_BaseSkid",
                PrimitiveType.Cube,
                group.transform,
                new Vector3(baseX, 0.11f, baseZ),
                Quaternion.identity,
                new Vector3(2.2f, 0.22f, 9.5f),
                steelMat,
                removeCollider: false);

            // Primary dual horizontal header pipes running along Z
            CreatePrimitive(
                "HeaderPipe_Main",
                PrimitiveType.Cylinder,
                group.transform,
                new Vector3(baseX - 0.25f, baseY + 0.35f, baseZ),
                Quaternion.Euler(90f, 0f, 0f),
                new Vector3(0.42f, 4.4f, 0.42f),
                steelMat,
                removeCollider: false);

            CreatePrimitive(
                "HeaderPipe_Aux",
                PrimitiveType.Cylinder,
                group.transform,
                new Vector3(baseX + 0.45f, baseY + 0.10f, baseZ),
                Quaternion.Euler(90f, 0f, 0f),
                new Vector3(0.28f, 4.2f, 0.28f),
                steelMat,
                removeCollider: false);

            // Pipe support saddles
            float[] saddleOffsetsZ = { -3.6f, -1.2f, 1.2f, 3.6f };
            for (int i = 0; i < saddleOffsetsZ.Length; i++)
            {
                float sz = baseZ + saddleOffsetsZ[i];
                CreatePrimitive(
                    $"Manifold_Support_{i:D2}",
                    PrimitiveType.Cube,
                    group.transform,
                    new Vector3(baseX + 0.08f, 0.46f, sz),
                    Quaternion.identity,
                    new Vector3(1.5f, 0.48f, 0.24f),
                    amberMat,
                    removeCollider: false);
            }

            // Valve stations with risers, flange collars, valve bodies, and handwheel discs
            float[] valveOffsetsZ = { -2.4f, 0f, 2.4f };
            for (int i = 0; i < valveOffsetsZ.Length; i++)
            {
                float vz = baseZ + valveOffsetsZ[i];

                // Vertical riser connecting aux and main levels
                CreatePrimitive(
                    $"ValveRiser_{i:D2}",
                    PrimitiveType.Cylinder,
                    group.transform,
                    new Vector3(baseX - 0.25f, baseY + 0.65f, vz),
                    Quaternion.identity,
                    new Vector3(0.22f, 0.45f, 0.22f),
                    steelMat,
                    removeCollider: false);

                // Flange collar
                CreatePrimitive(
                    $"ValveFlange_{i:D2}",
                    PrimitiveType.Cylinder,
                    group.transform,
                    new Vector3(baseX - 0.25f, baseY + 0.95f, vz),
                    Quaternion.identity,
                    new Vector3(0.36f, 0.06f, 0.36f),
                    amberMat,
                    removeCollider: true);

                // Valve stem
                CreatePrimitive(
                    $"ValveStem_{i:D2}",
                    PrimitiveType.Cylinder,
                    group.transform,
                    new Vector3(baseX - 0.25f, baseY + 1.18f, vz),
                    Quaternion.identity,
                    new Vector3(0.08f, 0.20f, 0.08f),
                    steelMat,
                    removeCollider: true);

                // Handwheel disc (horizontal top wheel)
                CreatePrimitive(
                    $"ValveHandwheel_Top_{i:D2}",
                    PrimitiveType.Cylinder,
                    group.transform,
                    new Vector3(baseX - 0.25f, baseY + 1.38f, vz),
                    Quaternion.identity,
                    new Vector3(0.62f, 0.04f, 0.62f),
                    valveRedMat,
                    removeCollider: true);

                // Side-mounted branch pipe + vertical handwheel disc facing East toward DD1
                CreatePrimitive(
                    $"BranchPipe_{i:D2}",
                    PrimitiveType.Cylinder,
                    group.transform,
                    new Vector3(baseX + 0.45f, baseY + 0.55f, vz),
                    Quaternion.Euler(0f, 0f, 90f),
                    new Vector3(0.18f, 0.38f, 0.18f),
                    steelMat,
                    removeCollider: false);

                CreatePrimitive(
                    $"ValveHandwheel_Side_{i:D2}",
                    PrimitiveType.Cylinder,
                    group.transform,
                    new Vector3(baseX + 0.85f, baseY + 0.55f, vz),
                    Quaternion.Euler(0f, 0f, 90f),
                    new Vector3(0.50f, 0.04f, 0.50f),
                    valveRedMat,
                    removeCollider: true);
            }
        }

        // 5) Elevated walkable Yellow Steel Catwalk + Support Stanchions + Handrails + Access Ramp
        private static void BuildElevatedCatwalk(Transform parent, Material steelMat, Material safetyAmberMat)
        {
            GameObject catwalkGroup = CreateChildGroup("DD1_ElevatedCatwalk", parent);

            const float catwalkX = -24f;
            const float catwalkY = 3.2f;
            const float catwalkZ = 25f;
            const float width = 2.6f;
            const float length = 42f; // Z: [4, 46]
            const float deckThickness = 0.18f;

            float deckTopY = catwalkY + deckThickness * 0.5f;   // 3.29f
            float deckBottomY = catwalkY - deckThickness * 0.5f; // 3.11f
            float minZ = catwalkZ - length * 0.5f;               // 4f
            float maxZ = catwalkZ + length * 0.5f;               // 46f
            float halfW = width * 0.5f;                          // 1.3f

            // Main walkable steel deck
            CreatePrimitive(
                "DD1_CatwalkDeck",
                PrimitiveType.Cube,
                catwalkGroup.transform,
                new Vector3(catwalkX, catwalkY, catwalkZ),
                Quaternion.identity,
                new Vector3(width, deckThickness, length),
                safetyAmberMat,
                removeCollider: false);

            // Under-deck longitudinal steel stringers
            CreatePrimitive(
                "DD1_CatwalkStringer_W",
                PrimitiveType.Cube,
                catwalkGroup.transform,
                new Vector3(catwalkX - halfW + 0.18f, deckBottomY - 0.12f, catwalkZ),
                Quaternion.identity,
                new Vector3(0.16f, 0.24f, length),
                steelMat,
                removeCollider: true);

            CreatePrimitive(
                "DD1_CatwalkStringer_E",
                PrimitiveType.Cube,
                catwalkGroup.transform,
                new Vector3(catwalkX + halfW - 0.18f, deckBottomY - 0.12f, catwalkZ),
                Quaternion.identity,
                new Vector3(0.16f, 0.24f, length),
                steelMat,
                removeCollider: true);

            // Support stanchions down to yard asphalt (with non-zero top baseplates)
            const int stanchionPairs = 8;
            float stanchionHeight = deckBottomY;
            float stanchionCenterY = stanchionHeight * 0.5f;

            for (int i = 0; i < stanchionPairs; i++)
            {
                float t = (float)i / (stanchionPairs - 1);
                float sz = Mathf.Lerp(minZ + 0.6f, maxZ - 0.6f, t);

                for (int side = -1; side <= 1; side += 2)
                {
                    float sx = catwalkX + side * (halfW - 0.22f);
                    string sideTag = side < 0 ? "W" : "E";

                    CreatePrimitive(
                        $"Stanchion_{i:D2}_{sideTag}",
                        PrimitiveType.Cube,
                        catwalkGroup.transform,
                        new Vector3(sx, stanchionCenterY, sz),
                        Quaternion.identity,
                        new Vector3(0.22f, stanchionHeight, 0.22f),
                        steelMat,
                        removeCollider: false);

                    // Footing baseplate (top at Y = 0.08f, never Y = 0.00f)
                    CreatePrimitive(
                        $"StanchionPlate_{i:D2}_{sideTag}",
                        PrimitiveType.Cube,
                        catwalkGroup.transform,
                        new Vector3(sx, 0.04f, sz),
                        Quaternion.identity,
                        new Vector3(0.46f, 0.08f, 0.46f),
                        steelMat,
                        removeCollider: false);
                }

                // Cross-beam tie under deck
                CreatePrimitive(
                    $"CrossBeam_{i:D2}",
                    PrimitiveType.Cube,
                    catwalkGroup.transform,
                    new Vector3(catwalkX, deckBottomY - 0.12f, sz),
                    Quaternion.identity,
                    new Vector3(width - 0.24f, 0.18f, 0.18f),
                    steelMat,
                    removeCollider: true);
            }

            // Perimeter yellow safety handrails (leaving South ramp entry at Z = 4f open)
            const float railHeight = 1.05f;
            const float midRailHeight = 0.55f;
            const float railThickness = 0.06f;
            float railEdgeOffset = halfW - 0.06f;

            // West & East full-length top + mid rails
            for (int side = -1; side <= 1; side += 2)
            {
                float rx = catwalkX + side * railEdgeOffset;
                string sideTag = side < 0 ? "W" : "E";

                CreatePrimitive(
                    $"Handrail_Top_{sideTag}",
                    PrimitiveType.Cube,
                    catwalkGroup.transform,
                    new Vector3(rx, deckTopY + railHeight, catwalkZ),
                    Quaternion.identity,
                    new Vector3(railThickness, railThickness, length),
                    safetyAmberMat,
                    removeCollider: false);

                CreatePrimitive(
                    $"Handrail_Mid_{sideTag}",
                    PrimitiveType.Cube,
                    catwalkGroup.transform,
                    new Vector3(rx, deckTopY + midRailHeight, catwalkZ),
                    Quaternion.identity,
                    new Vector3(railThickness, railThickness, length),
                    safetyAmberMat,
                    removeCollider: true);
            }

            // North end guardrail (Z = maxZ)
            CreatePrimitive(
                "Handrail_Top_N",
                PrimitiveType.Cube,
                catwalkGroup.transform,
                new Vector3(catwalkX, deckTopY + railHeight, maxZ - 0.06f),
                Quaternion.identity,
                new Vector3(width, railThickness, railThickness),
                safetyAmberMat,
                removeCollider: false);

            CreatePrimitive(
                "Handrail_Mid_N",
                PrimitiveType.Cube,
                catwalkGroup.transform,
                new Vector3(catwalkX, deckTopY + midRailHeight, maxZ - 0.06f),
                Quaternion.identity,
                new Vector3(width, railThickness, railThickness),
                safetyAmberMat,
                removeCollider: true);

            // Vertical handrail posts along West & East sides
            const int railPostCount = 15;
            for (int i = 0; i < railPostCount; i++)
            {
                float t = (float)i / (railPostCount - 1);
                float pz = Mathf.Lerp(minZ + 0.08f, maxZ - 0.08f, t);

                for (int side = -1; side <= 1; side += 2)
                {
                    float px = catwalkX + side * railEdgeOffset;
                    string sideTag = side < 0 ? "W" : "E";

                    CreatePrimitive(
                        $"HandrailPost_{i:D2}_{sideTag}",
                        PrimitiveType.Cube,
                        catwalkGroup.transform,
                        new Vector3(px, deckTopY + railHeight * 0.5f, pz),
                        Quaternion.identity,
                        new Vector3(railThickness, railHeight, railThickness),
                        safetyAmberMat,
                        removeCollider: false);
                }
            }

            // Sloped steel access ramp (DD1_CatwalkRamp) connecting yard asphalt (Z = -4f) up to catwalk (Z = 4f)
            BuildCatwalkAccessRamp(catwalkGroup.transform, catwalkX, deckTopY, width, steelMat, safetyAmberMat);
        }

        private static void BuildCatwalkAccessRamp(
            Transform parent,
            float catwalkX,
            float catwalkTopY,
            float width,
            Material steelMat,
            Material safetyAmberMat)
        {
            GameObject rampGroup = CreateChildGroup("DD1_CatwalkRamp", parent);

            const float rampStartZ = -4f; // Ground end
            const float rampEndZ = 4f;    // Catwalk connection end
            const float groundEntryTopY = 0.02f; // Just above Y = 0.00f, never coplanar
            const float rampThickness = 0.16f;

            Vector3 topStart = new Vector3(catwalkX, groundEntryTopY, rampStartZ);
            Vector3 topEnd = new Vector3(catwalkX, catwalkTopY, rampEndZ);
            Vector3 span = topEnd - topStart;

            float rampSlopeLength = span.magnitude;
            float slopeAngleDeg = Mathf.Atan2(span.y, span.z) * Mathf.Rad2Deg;
            Quaternion rampRot = Quaternion.Euler(-slopeAngleDeg, 0f, 0f);

            // Offset center along local -up by half thickness so the top walkable face aligns with topStart..topEnd
            Vector3 rampNormal = rampRot * Vector3.up;
            Vector3 rampCenter = (topStart + topEnd) * 0.5f - rampNormal * (rampThickness * 0.5f);

            CreatePrimitive(
                "DD1_CatwalkRamp_Deck",
                PrimitiveType.Cube,
                rampGroup.transform,
                rampCenter,
                rampRot,
                new Vector3(width, rampThickness, rampSlopeLength),
                steelMat,
                removeCollider: false);

            // Ramp side safety handrails
            const float railHeight = 1.05f;
            const float railThickness = 0.06f;
            float halfW = width * 0.5f - 0.06f;

            for (int side = -1; side <= 1; side += 2)
            {
                float rx = catwalkX + side * halfW;
                string sideTag = side < 0 ? "W" : "E";

                Vector3 railCenter = (topStart + topEnd) * 0.5f
                    + new Vector3(side * halfW, railHeight, 0f);

                CreatePrimitive(
                    $"RampHandrail_Top_{sideTag}",
                    PrimitiveType.Cube,
                    rampGroup.transform,
                    railCenter,
                    rampRot,
                    new Vector3(railThickness, railThickness, rampSlopeLength),
                    safetyAmberMat,
                    removeCollider: false);

                Vector3 midRailCenter = (topStart + topEnd) * 0.5f
                    + new Vector3(side * halfW, railHeight * 0.52f, 0f);

                CreatePrimitive(
                    $"RampHandrail_Mid_{sideTag}",
                    PrimitiveType.Cube,
                    rampGroup.transform,
                    midRailCenter,
                    rampRot,
                    new Vector3(railThickness, railThickness, rampSlopeLength),
                    safetyAmberMat,
                    removeCollider: true);

                // Vertical stanchion posts along ramp slope
                const int rampPosts = 5;
                for (int i = 0; i < rampPosts; i++)
                {
                    float t = (float)i / (rampPosts - 1);
                    Vector3 postBase = Vector3.Lerp(topStart, topEnd, t) + new Vector3(side * halfW, 0f, 0f);

                    CreatePrimitive(
                        $"RampPost_{i:D2}_{sideTag}",
                        PrimitiveType.Cube,
                        rampGroup.transform,
                        postBase + Vector3.up * (railHeight * 0.5f),
                        Quaternion.identity,
                        new Vector3(railThickness, railHeight, railThickness),
                        safetyAmberMat,
                        removeCollider: false);
                }
            }

            // Intermediate support pier under midpoint of ramp
            float midZ = (rampStartZ + rampEndZ) * 0.5f;
            float midDeckBottomY = (groundEntryTopY + catwalkTopY) * 0.5f - rampThickness;
            if (midDeckBottomY > 0.1f)
            {
                CreatePrimitive(
                    "Ramp_SupportPier",
                    PrimitiveType.Cube,
                    rampGroup.transform,
                    new Vector3(catwalkX, midDeckBottomY * 0.5f, midZ),
                    Quaternion.identity,
                    new Vector3(width - 0.3f, midDeckBottomY, 0.28f),
                    steelMat,
                    removeCollider: false);
            }
        }

        private static GameObject CreateChildGroup(string name, Transform parent)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go;
        }

        private static GameObject CreatePrimitive(
            string name,
            PrimitiveType type,
            Transform parent,
            Vector3 worldPos,
            Quaternion worldRot,
            Vector3 localScale,
            Material material,
            bool removeCollider)
        {
            GameObject go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.position = worldPos;
            go.transform.rotation = worldRot;
            go.transform.localScale = localScale;
            go.isStatic = true;

            if (material != null)
            {
                Renderer rend = go.GetComponent<Renderer>();
                if (rend != null)
                {
                    rend.sharedMaterial = material;
                }
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

        private static Material CreateUrpLitMaterial(string name, Color baseColor, float metallic, float smoothness)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            Material mat = new Material(shader) { name = name };
            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", baseColor);
            }
            if (mat.HasProperty("_Color"))
            {
                mat.SetColor("_Color", baseColor);
            }
            if (mat.HasProperty("_Metallic"))
            {
                mat.SetFloat("_Metallic", metallic);
            }
            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", smoothness);
            }
            return mat;
        }

        private static Material CreateToxicSumpMaterial(string name, string hexColor)
        {
            if (!ColorUtility.TryParseHtmlString(hexColor, out Color baseColor))
            {
                baseColor = new Color(0.165f, 0.408f, 0.149f);
            }

            Material mat = CreateUrpLitMaterial(name, baseColor, 0.0f, 0.88f);
            mat.EnableKeyword("_EMISSION");
            mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.BakedEmissive;

            if (mat.HasProperty("_EmissionColor"))
            {
                mat.SetColor("_EmissionColor", baseColor * 1.65f);
            }

            return mat;
        }
    }
}
