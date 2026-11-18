using UnityEditor;
using UnityEngine;
using ShipyardCat.World;

namespace ShipyardCat.Editor
{
    public static class ShipyardLandmarkBuilder
    {
        private sealed class AccentPalette
        {
            public Material BigBlue;
            public Material Timber;
            public Material FlightDeck;
            public Material DeckMarking;
            public Material TugRed;
            public Material TugWhite;
            public Material Glass;
            public Material Cushion;
            public Material Bowl;
            public Material DarkRoof;
        }

        public static void BuildAllLandmarks(
            Transform worldRoot,
            Material concreteMat,
            Material steelMat,
            Material subMat,
            Material waterMat,
            Material safetyAmberMat,
            Material sanctuaryMat)
        {
            AccentPalette accents = CreateAccentPalette();

            BuildDryDock1(worldRoot, concreteMat, steelMat, safetyAmberMat);
            BuildDryDock12AndCarrier(worldRoot, concreteMat, steelMat, safetyAmberMat, accents);
            BuildDryDock2AndSubmarine(worldRoot, concreteMat, steelMat, subMat, safetyAmberMat, accents);
            BuildBigBlueGantryCrane(worldRoot, steelMat, safetyAmberMat, accents);
            BuildEastPierRiverAndTugboat(worldRoot, concreteMat, steelMat, waterMat, safetyAmberMat, accents);
            BuildCatMotelSanctuary(worldRoot, sanctuaryMat, accents);
            BuildGate4Checkpoint(worldRoot, concreteMat, steelMat, safetyAmberMat, accents);
            BuildWalkableBuilding(
                "JMAF_Building",
                new Vector3(-25f, 0f, -35f),
                new Vector3(16f, 6.5f, 14f),
                worldRoot,
                concreteMat,
                steelMat,
                safetyAmberMat,
                accents);
            BuildWalkableBuilding(
                "Apprentice_School",
                new Vector3(22f, 0f, 35f),
                new Vector3(18f, 7f, 16f),
                worldRoot,
                concreteMat,
                steelMat,
                safetyAmberMat,
                accents);
        }

        private static AccentPalette CreateAccentPalette()
        {
            return new AccentPalette
            {
                BigBlue = CreateAccentMaterial("Mat_BigBlueCrane", new Color(0.08f, 0.34f, 0.74f), 0.35f, 0.45f),
                Timber = CreateAccentMaterial("Mat_EastPierTimber", new Color(0.42f, 0.28f, 0.16f), 0.0f, 0.25f),
                FlightDeck = CreateAccentMaterial("Mat_CVN80_FlightDeck", new Color(0.18f, 0.19f, 0.21f), 0.1f, 0.3f),
                DeckMarking = CreateAccentMaterial("Mat_DeckMarking", new Color(0.92f, 0.90f, 0.82f), 0.0f, 0.2f),
                TugRed = CreateAccentMaterial("Mat_TugRed", new Color(0.66f, 0.14f, 0.12f), 0.2f, 0.45f),
                TugWhite = CreateAccentMaterial("Mat_TugWhite", new Color(0.92f, 0.92f, 0.89f), 0.1f, 0.5f),
                Glass = CreateAccentMaterial("Mat_BridgeGlass", new Color(0.16f, 0.28f, 0.36f), 0.4f, 0.85f),
                Cushion = CreateAccentMaterial("Mat_SanctuaryCushion", new Color(0.76f, 0.35f, 0.25f), 0.0f, 0.2f),
                Bowl = CreateAccentMaterial("Mat_CatFoodBowl", new Color(0.78f, 0.80f, 0.84f), 0.7f, 0.65f),
                DarkRoof = CreateAccentMaterial("Mat_BuildingRoof", new Color(0.22f, 0.25f, 0.28f), 0.25f, 0.4f)
            };
        }

        private static Material CreateAccentMaterial(string name, Color color, float metallic, float smoothness)
        {
            Shader urpLit = Shader.Find("Universal Render Pipeline/Lit");
            Material mat = new Material(urpLit);
            mat.name = name;
            mat.SetColor("_BaseColor", color);
            mat.color = color;
            mat.SetFloat("_Metallic", metallic);
            mat.SetFloat("_Smoothness", smoothness);
            return mat;
        }

        #region 1. Dry Dock 1
        private static void BuildDryDock1(Transform parent, Material concreteMat, Material steelMat, Material safetyAmberMat)
        {
            Transform root = CreateGroup("DryDock_01", new Vector3(-45f, -1.9f, 25f), parent);

            const float basinWidth = 22f;
            const float basinLength = 72f;

            // Dock floor (top surface around y = -3.9 world)
            CreateSolidBox("DD1_Floor", root, new Vector3(0f, -2.5f, 0f), new Vector3(basinWidth, 1f, basinLength), concreteMat);

            // Stepped granite altar walls (East, West, South) rising up to ground level (local y = +1.9 -> world 0.0)
            float[] stepWidths = { 1.8f, 1.8f, 2.4f };
            float[] stepHeights = { 1.4f, 2.8f, 4.4f };

            float xOffset = basinWidth * 0.5f;
            for (int i = 0; i < stepWidths.Length; i++)
            {
                float w = stepWidths[i];
                float h = stepHeights[i];
                float cx = xOffset + w * 0.5f;
                float cy = -2.5f + h * 0.5f;
                float zLen = basinLength + (i + 1) * 3.6f;

                CreateSolidBox($"DD1_WestStep_{i + 1}", root, new Vector3(-cx, cy, 0f), new Vector3(w, h, zLen), concreteMat);
                CreateSolidBox($"DD1_EastStep_{i + 1}", root, new Vector3(cx, cy, 0f), new Vector3(w, h, zLen), concreteMat);

                float southZ = -(basinLength * 0.5f + w * 0.5f + i * 1.8f);
                CreateSolidBox($"DD1_SouthStep_{i + 1}", root, new Vector3(0f, cy, southZ), new Vector3(basinWidth + i * 3.6f, h, w), concreteMat);

                xOffset += w;
            }

            // North Caisson Gate
            float gateZ = basinLength * 0.5f + 1.2f;
            CreateSolidBox("DD1_CaissonGate", root, new Vector3(0f, -0.3f, gateZ), new Vector3(basinWidth + 2f, 4.2f, 2.2f), steelMat);
            CreateSolidBox("DD1_CaissonWalkway", root, new Vector3(0f, 1.85f, gateZ), new Vector3(basinWidth + 3f, 0.25f, 2.6f), concreteMat);
            CreateSolidBox("DD1_CaissonCurb_N", root, new Vector3(0f, 2.15f, gateZ + 1.15f), new Vector3(basinWidth + 3f, 0.4f, 0.2f), safetyAmberMat);
            CreateSolidBox("DD1_CaissonCurb_S", root, new Vector3(0f, 2.15f, gateZ - 1.15f), new Vector3(basinWidth + 3f, 0.4f, 0.2f), safetyAmberMat);

            // Coping safety bollards along east rim
            for (int i = -3; i <= 3; i++)
            {
                CreateSolidBox($"DD1_Bollard_E_{i + 3}", root, new Vector3(basinWidth * 0.5f + 0.5f, 2.3f, i * 10f), new Vector3(0.4f, 0.8f, 0.4f), safetyAmberMat);
            }
        }
        #endregion

        #region 2. Dry Dock 12 + CVN-80 Aircraft Carrier
        private static void BuildDryDock12AndCarrier(
            Transform parent,
            Material concreteMat,
            Material steelMat,
            Material safetyAmberMat,
            AccentPalette accents)
        {
            Transform root = CreateGroup("DryDock_12_CVN80", new Vector3(-115f, 0f, 220f), parent);

            const float basinWidth = 64f;
            const float basinLength = 270f;
            const float floorTopY = -8.0f;

            // Dock basin floor
            CreateSolidBox("DD12_Floor", root, new Vector3(0f, floorTopY - 0.5f, 0f), new Vector3(basinWidth, 1f, basinLength), concreteMat);

            // Stepped concrete dock walls rising from floorTopY to y = 0
            float[] stepWidths = { 2.5f, 2.5f, 4.0f };
            float[] stepHeights = { 2.6f, 5.4f, 8.0f };

            float xOff = basinWidth * 0.5f;
            for (int i = 0; i < stepWidths.Length; i++)
            {
                float w = stepWidths[i];
                float h = stepHeights[i];
                float cx = xOff + w * 0.5f;
                float cy = floorTopY + h * 0.5f;
                float zLen = basinLength + (i + 1) * 5f;

                CreateSolidBox($"DD12_WestWall_{i + 1}", root, new Vector3(-cx, cy, 0f), new Vector3(w, h, zLen), concreteMat);
                CreateSolidBox($"DD12_EastWall_{i + 1}", root, new Vector3(cx, cy, 0f), new Vector3(w, h, zLen), concreteMat);

                float southZ = -(basinLength * 0.5f + w * 0.5f + i * 2.5f);
                CreateSolidBox($"DD12_SouthWall_{i + 1}", root, new Vector3(0f, cy, southZ), new Vector3(basinWidth + i * 5f, h, w), concreteMat);
                xOff += w;
            }

            // North Caisson Gate
            float gateZ = basinLength * 0.5f + 2f;
            CreateSolidBox("DD12_CaissonGate", root, new Vector3(0f, floorTopY * 0.5f, gateZ), new Vector3(basinWidth + 4f, 8.2f, 4f), steelMat);
            CreateSolidBox("DD12_CaissonSafetyCurb", root, new Vector3(0f, 0.3f, gateZ), new Vector3(basinWidth + 4f, 0.5f, 0.4f), safetyAmberMat);

            // CVN-80 Aircraft Carrier
            Transform carrier = CreateGroup("CVN80_Carrier", Vector3.zero, root);

            // Keel blocks
            for (int i = -6; i <= 6; i++)
            {
                CreateSolidBox($"CVN80_KeelBlock_{i + 6}", carrier, new Vector3(0f, floorTopY + 0.75f, i * 16f), new Vector3(14f, 1.5f, 2.4f), concreteMat);
            }

            // Lower & upper hull
            CreateSolidBox("CVN80_LowerHull", carrier, new Vector3(0f, -2.5f, 0f), new Vector3(28f, 8f, 210f), steelMat);
            CreateSolidBox("CVN80_MidHull", carrier, new Vector3(0f, 3.0f, 4f), new Vector3(34f, 5f, 224f), steelMat);
            CreateSolidBox("CVN80_BowFlare", carrier, new Vector3(0f, 3.5f, 118f), new Vector3(20f, 4f, 20f), steelMat);

            // Flight Deck (y = 6.2)
            CreateSolidBox("CVN80_FlightDeck_Main", carrier, new Vector3(0f, 6.2f, 4f), new Vector3(44f, 1.4f, 236f), accents.FlightDeck);
            CreateSolidBox("CVN80_FlightDeck_Angled", carrier, new Vector3(-8f, 6.2f, 6f), new Vector3(20f, 1.35f, 145f), accents.FlightDeck);

            // Decorative flight deck center & landing stripes
            CreateDecorativeBox("CVN80_DeckStripe_Center", carrier, new Vector3(0f, 6.92f, 4f), new Vector3(0.7f, 0.04f, 220f), accents.DeckMarking);
            CreateDecorativeBox("CVN80_DeckStripe_Angled", carrier, new Vector3(-7f, 6.92f, 10f), new Vector3(0.6f, 0.04f, 128f), accents.DeckMarking);

            // Island Tower on Starboard (+X) aft quarter
            Transform island = CreateGroup("CVN80_IslandTower", new Vector3(17.5f, 6.9f, -42f), carrier);
            CreateSolidBox("Island_Base", island, new Vector3(0f, 4f, 0f), new Vector3(8.5f, 8f, 20f), steelMat);
            CreateSolidBox("Island_Bridge", island, new Vector3(-0.3f, 10.5f, 1.5f), new Vector3(9.5f, 5f, 14f), steelMat);
            CreateDecorativeBox("Island_BridgeWindows", island, new Vector3(-0.4f, 11.2f, 1.5f), new Vector3(9.7f, 1.3f, 12.6f), accents.Glass);
            CreateSolidBox("Island_UpperControl", island, new Vector3(0f, 15f, -1f), new Vector3(6.5f, 4f, 10f), steelMat);
            CreateDecorativeBox("Island_Mast", island, new Vector3(0f, 21f, -1f), new Vector3(1.6f, 9f, 1.6f), steelMat);
            CreateDecorativeBox("Island_RadarArray", island, new Vector3(0f, 25f, -1f), new Vector3(5.5f, 1.2f, 1.2f), safetyAmberMat);
        }
        #endregion

        #region 3. Dry Dock 2 + 115m Virginia-Class Submarine
        private static void BuildDryDock2AndSubmarine(
            Transform parent,
            Material concreteMat,
            Material steelMat,
            Material subMat,
            Material safetyAmberMat,
            AccentPalette accents)
        {
            Transform root = CreateGroup("DryDock_02_Submarine", new Vector3(-165f, 0f, 95f), parent);

            const float basinWidth = 24f;
            const float basinLength = 140f;
            const float floorTopY = -6.0f;

            // Dock floor
            CreateSolidBox("DD2_Floor", root, new Vector3(0f, floorTopY - 0.5f, 0f), new Vector3(basinWidth, 1f, basinLength), concreteMat);

            // Stepped dock walls rising to ground level y = 0
            float[] stepWidths = { 1.8f, 1.8f, 2.4f };
            float[] stepHeights = { 2.0f, 4.0f, 6.0f };

            float xOff = basinWidth * 0.5f;
            for (int i = 0; i < stepWidths.Length; i++)
            {
                float w = stepWidths[i];
                float h = stepHeights[i];
                float cx = xOff + w * 0.5f;
                float cy = floorTopY + h * 0.5f;
                float zLen = basinLength + (i + 1) * 3.6f;

                CreateSolidBox($"DD2_WestStep_{i + 1}", root, new Vector3(-cx, cy, 0f), new Vector3(w, h, zLen), concreteMat);
                CreateSolidBox($"DD2_EastStep_{i + 1}", root, new Vector3(cx, cy, 0f), new Vector3(w, h, zLen), concreteMat);

                float southZ = -(basinLength * 0.5f + w * 0.5f + i * 1.8f);
                CreateSolidBox($"DD2_SouthStep_{i + 1}", root, new Vector3(0f, cy, southZ), new Vector3(basinWidth + i * 3.6f, h, w), concreteMat);
                xOff += w;
            }

            // North Caisson Gate
            float gateZ = basinLength * 0.5f + 1.5f;
            CreateSolidBox("DD2_CaissonGate", root, new Vector3(0f, floorTopY * 0.5f, gateZ), new Vector3(basinWidth + 2f, 6.2f, 2.4f), steelMat);
            CreateSolidBox("DD2_CaissonTrim", root, new Vector3(0f, 0.25f, gateZ), new Vector3(basinWidth + 2f, 0.3f, 0.3f), safetyAmberMat);

            // Keel cribs along centerline
            Transform subRoot = CreateGroup("VirginiaClass_SSN", Vector3.zero, root);
            for (int i = -4; i <= 4; i++)
            {
                CreateSolidBox($"SSN_KeelCrib_{i + 4}", subRoot, new Vector3(0f, floorTopY + 0.9f, i * 11f), new Vector3(5.6f, 1.8f, 1.8f), accents.Timber);
            }

            // 115m Virginia-Class Submarine Hull (total Z span = 115m: -57.5 to +57.5)
            // Cylindrical midbody: 92m long, 10.4m diameter (CapsuleCollider replaced with BoxCollider)
            const float hullCenterY = -6.0f + 1.8f + 5.2f; // resting atop 1.8m keel cribs -> +1.0m world
            GameObject hullCyl = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            hullCyl.name = "SSN_PressureHull";
            hullCyl.transform.SetParent(subRoot, false);
            hullCyl.transform.localPosition = new Vector3(0f, hullCenterY, 2f);
            hullCyl.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            hullCyl.transform.localScale = new Vector3(10.4f, 46f, 10.4f); // 46*2 = 92m along Z
            ApplyMaterial(hullCyl, subMat);
            ReplaceWithBoxCollider(hullCyl);

            // Bow dome (+Z from +48 to +57.5 => 9.5m)
            GameObject bowCap = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            bowCap.name = "SSN_BowDome";
            bowCap.transform.SetParent(subRoot, false);
            bowCap.transform.localPosition = new Vector3(0f, hullCenterY, 48f);
            bowCap.transform.localScale = new Vector3(10.4f, 10.4f, 19f); // extends +9.5m to +57.5m
            ApplyMaterial(bowCap, subMat);
            ReplaceWithBoxCollider(bowCap);

            // Tapered stern (-Z from -44 to -57.5 => 13.5m)
            GameObject sternCone = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sternCone.name = "SSN_SternTaper";
            sternCone.transform.SetParent(subRoot, false);
            sternCone.transform.localPosition = new Vector3(0f, hullCenterY, -44f);
            sternCone.transform.localScale = new Vector3(10.2f, 10.2f, 27f); // extends -13.5m to -57.5m
            ApplyMaterial(sternCone, subMat);
            ReplaceWithBoxCollider(sternCone);

            // Conning Tower (Sail) forward of midships
            CreateSolidBox("SSN_ConningTower", subRoot, new Vector3(0f, hullCenterY + 6.8f, 16f), new Vector3(3.2f, 6.4f, 14f), subMat);
            CreateSolidBox("SSN_SailPlanes", subRoot, new Vector3(0f, hullCenterY + 7.5f, 18f), new Vector3(8.5f, 0.45f, 2.2f), subMat);

            // Decorative periscopes & masts atop conning tower
            CreateDecorativeBox("SSN_Periscope_01", subRoot, new Vector3(0f, hullCenterY + 11.8f, 18f), new Vector3(0.35f, 4.0f, 0.35f), steelMat);
            CreateDecorativeBox("SSN_PhotonicsMast", subRoot, new Vector3(0f, hullCenterY + 11.2f, 15f), new Vector3(0.45f, 3.0f, 0.45f), steelMat);

            // Stern cruciform stabilizers
            CreateSolidBox("SSN_SternStabilizer_H", subRoot, new Vector3(0f, hullCenterY, -52f), new Vector3(11f, 0.5f, 3.2f), subMat);
            CreateSolidBox("SSN_SternStabilizer_V", subRoot, new Vector3(0f, hullCenterY, -52f), new Vector3(0.5f, 11f, 3.2f), subMat);
        }
        #endregion

        #region 4. Big Blue 1,050T Gantry Crane
        private static void BuildBigBlueGantryCrane(
            Transform parent,
            Material steelMat,
            Material safetyAmberMat,
            AccentPalette accents)
        {
            Transform root = CreateGroup("BigBlue_1050T_GantryCrane", new Vector3(-115f, 0f, 210f), parent);

            const float halfSpanX = 43f; // 86m rail-to-rail straddling DD12 walls
            const float beamY = 76f;
            const float legSpacingZ = 14f;

            // Ground-level crane rails & bogies (solid BoxColliders)
            CreateSolidBox("BigBlue_WestRail", root, new Vector3(-halfSpanX, 0.25f, 0f), new Vector3(1.8f, 0.5f, 260f), steelMat);
            CreateSolidBox("BigBlue_EastRail", root, new Vector3(halfSpanX, 0.25f, 0f), new Vector3(1.8f, 0.5f, 260f), steelMat);

            CreateSolidBox("BigBlue_WestBogie", root, new Vector3(-halfSpanX, 1.5f, 0f), new Vector3(3.4f, 2.2f, 24f), safetyAmberMat);
            CreateSolidBox("BigBlue_EastBogie", root, new Vector3(halfSpanX, 1.5f, 0f), new Vector3(3.4f, 2.2f, 24f), safetyAmberMat);

            // Lower A-frame leg bases (solid up to y = 14m)
            CreateSolidBox("BigBlue_WestLegBase_N", root, new Vector3(-halfSpanX, 8f, legSpacingZ * 0.5f), new Vector3(2.8f, 12f, 3.2f), accents.BigBlue);
            CreateSolidBox("BigBlue_WestLegBase_S", root, new Vector3(-halfSpanX, 8f, -legSpacingZ * 0.5f), new Vector3(2.8f, 12f, 3.2f), accents.BigBlue);
            CreateSolidBox("BigBlue_EastLegBase_N", root, new Vector3(halfSpanX, 8f, legSpacingZ * 0.5f), new Vector3(2.8f, 12f, 3.2f), accents.BigBlue);
            CreateSolidBox("BigBlue_EastLegBase_S", root, new Vector3(halfSpanX, 8f, -legSpacingZ * 0.5f), new Vector3(2.8f, 12f, 3.2f), accents.BigBlue);

            // Upper crane legs, main box-girder bridge, trolley & trusses (purely decorative -> colliders destroyed)
            CreateDecorativeBox("BigBlue_WestUpperLeg_N", root, new Vector3(-halfSpanX, 45f, legSpacingZ * 0.35f), new Vector3(2.4f, 62f, 2.6f), accents.BigBlue);
            CreateDecorativeBox("BigBlue_WestUpperLeg_S", root, new Vector3(-halfSpanX, 45f, -legSpacingZ * 0.35f), new Vector3(2.4f, 62f, 2.6f), accents.BigBlue);
            CreateDecorativeBox("BigBlue_EastUpperLeg_N", root, new Vector3(halfSpanX, 45f, legSpacingZ * 0.35f), new Vector3(2.4f, 62f, 2.6f), accents.BigBlue);
            CreateDecorativeBox("BigBlue_EastUpperLeg_S", root, new Vector3(halfSpanX, 45f, -legSpacingZ * 0.35f), new Vector3(2.4f, 62f, 2.6f), accents.BigBlue);

            // Leg cross braces
            for (int y = 24; y <= 60; y += 18)
            {
                CreateDecorativeBox($"BigBlue_WestBrace_{y}", root, new Vector3(-halfSpanX, y, 0f), new Vector3(1.4f, 1.4f, legSpacingZ * 0.7f), accents.BigBlue);
                CreateDecorativeBox($"BigBlue_EastBrace_{y}", root, new Vector3(halfSpanX, y, 0f), new Vector3(1.4f, 1.4f, legSpacingZ * 0.7f), accents.BigBlue);
            }

            // Twin 1,050T Main Bridge Girders spanning DD12
            CreateDecorativeBox("BigBlue_MainGirder_N", root, new Vector3(0f, beamY, 4.5f), new Vector3(96f, 6.5f, 3.2f), accents.BigBlue);
            CreateDecorativeBox("BigBlue_MainGirder_S", root, new Vector3(0f, beamY, -4.5f), new Vector3(96f, 6.5f, 3.2f), accents.BigBlue);
            CreateDecorativeBox("BigBlue_UpperTrussCap", root, new Vector3(0f, beamY + 4.5f, 0f), new Vector3(94f, 1.8f, 10f), accents.BigBlue);

            // Overhead Trolley, Hoist Cables & Hook Block
            CreateDecorativeBox("BigBlue_TrolleyCarriage", root, new Vector3(-4f, beamY + 4.2f, 0f), new Vector3(10f, 3.5f, 12f), safetyAmberMat);
            CreateDecorativeBox("BigBlue_HoistCable_W", root, new Vector3(-6f, 44f, 0f), new Vector3(0.25f, 58f, 0.25f), steelMat);
            CreateDecorativeBox("BigBlue_HoistCable_E", root, new Vector3(-2f, 44f, 0f), new Vector3(0.25f, 58f, 0.25f), steelMat);
            CreateDecorativeBox("BigBlue_MainHookBlock", root, new Vector3(-4f, 14.5f, 0f), new Vector3(5.5f, 2.5f, 3f), safetyAmberMat);
        }
        #endregion

        #region 5. East Timber Pier + James River + Tugboat Dorothy
        private static void BuildEastPierRiverAndTugboat(
            Transform parent,
            Material concreteMat,
            Material steelMat,
            Material waterMat,
            Material safetyAmberMat,
            AccentPalette accents)
        {
            // East Timber Pier: x = 32, z = -60..140 (length 200m, center z = 40)
            Transform pierRoot = CreateGroup("East_Timber_Pier", new Vector3(32f, 0f, 40f), parent);
            const float pierWidth = 8f;
            const float pierLength = 200f;

            // Walkable deck top at y = 0.25 (low curb-free access along west side)
            CreateSolidBox("EastPier_Deck", pierRoot, new Vector3(0f, 0.05f, 0f), new Vector3(pierWidth, 0.4f, pierLength), accents.Timber);
            CreateSolidBox("EastPier_WestRamp", pierRoot, new Vector3(-pierWidth * 0.5f - 0.6f, -0.02f, 0f), new Vector3(1.2f, 0.2f, pierLength), concreteMat);

            // East edge timber curb
            CreateSolidBox("EastPier_EastCurb", pierRoot, new Vector3(pierWidth * 0.5f - 0.25f, 0.35f, 0f), new Vector3(0.4f, 0.25f, pierLength), accents.Timber);

            // Pilings & Mooring Bollards
            for (int z = -96; z <= 96; z += 16)
            {
                CreateSolidCylinder($"EastPier_Piling_W_{z}", pierRoot, new Vector3(-pierWidth * 0.42f, -2.0f, z), new Vector3(0.55f, 2.0f, 0.55f), accents.Timber);
                CreateSolidCylinder($"EastPier_Piling_E_{z}", pierRoot, new Vector3(pierWidth * 0.42f, -2.0f, z), new Vector3(0.55f, 2.0f, 0.55f), accents.Timber);

                CreateSolidCylinder($"EastPier_Bollard_{z}", pierRoot, new Vector3(pierWidth * 0.5f - 0.6f, 0.6f, z), new Vector3(0.45f, 0.4f, 0.45f), safetyAmberMat);
            }

            // James River Water Plane: x=95, y=-1.8, z=60, scale 120x1x380
            GameObject waterGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
            waterGo.name = "JamesRiver_Water";
            waterGo.transform.SetParent(parent, false);
            waterGo.transform.position = new Vector3(95f, -1.8f, 60f);
            waterGo.transform.localScale = new Vector3(120f, 1f, 380f);
            ApplyMaterial(waterGo, waterMat);
            Object.DestroyImmediate(waterGo.GetComponent<Collider>());

            StylizedWaterSurface waterSurface = waterGo.AddComponent<StylizedWaterSurface>();

            // Tugboat Dorothy moored at (44, -1.2, 12)
            Transform tugRoot = CreateGroup("Tugboat_Dorothy", new Vector3(44f, -1.2f, 12f), parent);

            CreateSolidBox("Dorothy_HullLower", tugRoot, new Vector3(0f, 0.2f, 0f), new Vector3(6.2f, 2.0f, 18f), accents.TugRed);
            CreateSolidBox("Dorothy_HullUpper", tugRoot, new Vector3(0f, 1.55f, 0f), new Vector3(6.5f, 0.9f, 18.6f), steelMat);
            CreateSolidBox("Dorothy_BowPushKnee", tugRoot, new Vector3(0f, 1.5f, 9.6f), new Vector3(2.4f, 2.4f, 0.9f), safetyAmberMat);
            CreateSolidBox("Dorothy_Deckhouse", tugRoot, new Vector3(0f, 3.0f, -0.5f), new Vector3(4.4f, 2.2f, 8.2f), accents.TugWhite);
            CreateSolidBox("Dorothy_Pilothouse", tugRoot, new Vector3(0f, 4.9f, 1.2f), new Vector3(3.6f, 1.8f, 4.0f), accents.TugWhite);
            CreateDecorativeBox("Dorothy_BridgeWindows", tugRoot, new Vector3(0f, 5.15f, 1.35f), new Vector3(3.7f, 0.7f, 3.4f), accents.Glass);
            CreateSolidCylinder("Dorothy_Smokestack", tugRoot, new Vector3(0f, 5.4f, -2.6f), new Vector3(1.1f, 1.5f, 1.1f), steelMat);
            CreateDecorativeBox("Dorothy_StackStripe", tugRoot, new Vector3(0f, 6.2f, -2.6f), new Vector3(1.18f, 0.35f, 1.18f), safetyAmberMat);
            CreateDecorativeBox("Dorothy_Mast", tugRoot, new Vector3(0f, 7.6f, 1.2f), new Vector3(0.22f, 3.8f, 0.22f), steelMat);

            WireTugboatToWaterSurface(waterSurface, tugRoot.gameObject);
        }

        private static void WireTugboatToWaterSurface(StylizedWaterSurface waterSurface, GameObject tugboat)
        {
            if (waterSurface == null || tugboat == null)
            {
                return;
            }

            SerializedObject so = new SerializedObject(waterSurface);
            SerializedProperty prop = so.GetIterator();
            bool modified = false;

            while (prop.NextVisible(true))
            {
                string lower = prop.name.ToLowerInvariant();
                bool matchesVesselField = lower.Contains("float") || lower.Contains("boat") ||
                                          lower.Contains("vessel") || lower.Contains("tug") ||
                                          lower.Contains("target") || lower.Contains("bob");

                if (!matchesVesselField)
                {
                    continue;
                }

                if (prop.isArray && prop.propertyType == SerializedPropertyType.Generic)
                {
                    int idx = prop.arraySize;
                    prop.InsertArrayElementAtIndex(idx);
                    SerializedProperty elem = prop.GetArrayElementAtIndex(idx);

                    if (elem.propertyType == SerializedPropertyType.ObjectReference)
                    {
                        AssignTargetReference(elem, tugboat);
                        modified = true;
                    }
                    else if (elem.propertyType == SerializedPropertyType.Generic)
                    {
                        SerializedProperty child = elem.Copy();
                        SerializedProperty end = elem.GetEndProperty();
                        bool assignedChild = false;
                        while (child.NextVisible(true) && !SerializedProperty.EqualContents(child, end))
                        {
                            if (child.propertyType == SerializedPropertyType.ObjectReference)
                            {
                                AssignTargetReference(child, tugboat);
                                assignedChild = child.objectReferenceValue != null;
                                if (assignedChild)
                                {
                                    break;
                                }
                            }
                        }

                        if (assignedChild)
                        {
                            modified = true;
                        }
                        else
                        {
                            prop.DeleteArrayElementAtIndex(idx);
                        }
                    }
                }
                else if (prop.propertyType == SerializedPropertyType.ObjectReference && prop.name != "m_Script")
                {
                    AssignTargetReference(prop, tugboat);
                    if (prop.objectReferenceValue != null)
                    {
                        modified = true;
                    }
                }
            }

            if (modified)
            {
                so.ApplyModifiedPropertiesWithoutUndo();
            }

            EditorUtility.SetDirty(waterSurface);
        }

        private static void AssignTargetReference(SerializedProperty prop, GameObject tugboat)
        {
            prop.objectReferenceValue = tugboat.transform;
            if (prop.objectReferenceValue == null)
            {
                prop.objectReferenceValue = tugboat;
            }
        }
        #endregion

        #region 6. Cat Motel Sanctuary
        private static void BuildCatMotelSanctuary(Transform parent, Material sanctuaryMat, AccentPalette accents)
        {
            Transform root = CreateGroup("CatMotel_Sanctuary", new Vector3(18f, 0f, -28f), parent);

            // Raised sanctuary base pad (accessible step height 0.14m)
            CreateSolidBox("CatMotel_BasePad", root, new Vector3(0f, 0.07f, 0f), new Vector3(6.4f, 0.14f, 4.6f), accents.Timber);

            // Corner shelter posts
            CreateSolidBox("CatMotel_Post_NW", root, new Vector3(-2.6f, 1.15f, 1.7f), new Vector3(0.24f, 2.1f, 0.24f), accents.Timber);
            CreateSolidBox("CatMotel_Post_NE", root, new Vector3(2.6f, 1.15f, 1.7f), new Vector3(0.24f, 2.1f, 0.24f), accents.Timber);
            CreateSolidBox("CatMotel_Post_SW", root, new Vector3(-2.6f, 1.0f, -1.7f), new Vector3(0.24f, 1.8f, 0.24f), accents.Timber);
            CreateSolidBox("CatMotel_Post_SE", root, new Vector3(2.6f, 1.0f, -1.7f), new Vector3(0.24f, 1.8f, 0.24f), accents.Timber);

            // Windbreak back & side walls (front left open)
            CreateSolidBox("CatMotel_BackWall", root, new Vector3(0f, 0.9f, -1.7f), new Vector3(5.2f, 1.6f, 0.16f), sanctuaryMat);
            CreateSolidBox("CatMotel_LeftWall", root, new Vector3(-2.6f, 0.9f, 0f), new Vector3(0.16f, 1.6f, 3.4f), sanctuaryMat);

            // Sloped shelter roof
            GameObject roof = CreateSolidBox("CatMotel_ShelterRoof", root, new Vector3(0f, 2.15f, 0f), new Vector3(6.8f, 0.22f, 4.8f), sanctuaryMat);
            roof.transform.localRotation = Quaternion.Euler(-6f, 0f, 0f);

            // Interior cat cushion (decorative collider stripped for smooth walking)
            CreateDecorativeBox("CatMotel_CushionBase", root, new Vector3(-0.7f, 0.24f, -0.4f), new Vector3(2.4f, 0.2f, 1.8f), accents.Cushion);

            // 5 Food Bowls along front edge
            for (int i = 0; i < 5; i++)
            {
                float bx = -1.8f + i * 0.9f;
                GameObject bowl = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                bowl.name = $"CatMotel_FoodBowl_{i + 1}";
                bowl.transform.SetParent(root, false);
                bowl.transform.localPosition = new Vector3(bx, 0.21f, 1.35f);
                bowl.transform.localScale = new Vector3(0.45f, 0.08f, 0.45f);
                ApplyMaterial(bowl, accents.Bowl);
                Object.DestroyImmediate(bowl.GetComponent<Collider>());
            }
        }
        #endregion

        #region 7. Gate 4 Security Checkpoint
        private static void BuildGate4Checkpoint(
            Transform parent,
            Material concreteMat,
            Material steelMat,
            Material safetyAmberMat,
            AccentPalette accents)
        {
            Transform root = CreateGroup("Gate4_Security_Checkpoint", new Vector3(8f, 0f, -52f), parent);

            // Concrete security island & guard booth
            CreateSolidBox("Gate4_IslandPad", root, new Vector3(-3.5f, 0.08f, 0f), new Vector3(4.2f, 0.16f, 5.2f), concreteMat);
            CreateSolidBox("Gate4_GuardBooth", root, new Vector3(-3.5f, 1.65f, 0f), new Vector3(3.2f, 3.0f, 3.6f), steelMat);
            CreateDecorativeBox("Gate4_BoothWindows", root, new Vector3(-3.5f, 2.0f, 0f), new Vector3(3.28f, 0.9f, 3.68f), accents.Glass);
            CreateSolidBox("Gate4_BoothRoof", root, new Vector3(-3.5f, 3.25f, 0f), new Vector3(3.8f, 0.25f, 4.2f), safetyAmberMat);

            // Overhead checkpoint canopy spanning guard booth & turnstiles
            CreateSolidBox("Gate4_CanopyRoof", root, new Vector3(1.5f, 4.1f, 0f), new Vector3(14.5f, 0.35f, 5.5f), steelMat);
            CreateSolidBox("Gate4_CanopyTrim", root, new Vector3(1.5f, 4.12f, 2.75f), new Vector3(14.6f, 0.3f, 0.15f), safetyAmberMat);
            CreateSolidBox("Gate4_EastSupportPost", root, new Vector3(8.2f, 2.0f, 0f), new Vector3(0.4f, 4.0f, 0.4f), steelMat);

            // Turnstile lanes (wide walkable gaps between turnstile housings)
            for (int i = 0; i < 3; i++)
            {
                float tx = 1.2f + i * 2.8f;
                CreateSolidBox($"Gate4_TurnstileHousing_{i + 1}", root, new Vector3(tx, 0.65f, 0f), new Vector3(0.45f, 1.3f, 1.6f), steelMat);
                CreateDecorativeBox($"Gate4_TurnstileArms_{i + 1}", root, new Vector3(tx + 0.65f, 0.85f, 0f), new Vector3(0.9f, 0.08f, 0.08f), safetyAmberMat);
            }

            // Safety amber bollards protecting the checkpoint approaches
            CreateSolidCylinder("Gate4_Bollard_NW", root, new Vector3(-5.3f, 0.55f, 2.3f), new Vector3(0.35f, 0.55f, 0.35f), safetyAmberMat);
            CreateSolidCylinder("Gate4_Bollard_SW", root, new Vector3(-5.3f, 0.55f, -2.3f), new Vector3(0.35f, 0.55f, 0.35f), safetyAmberMat);
            CreateSolidCylinder("Gate4_Bollard_NE", root, new Vector3(8.2f, 0.55f, 2.3f), new Vector3(0.35f, 0.55f, 0.35f), safetyAmberMat);
            CreateSolidCylinder("Gate4_Bollard_SE", root, new Vector3(8.2f, 0.55f, -2.3f), new Vector3(0.35f, 0.55f, 0.35f), safetyAmberMat);
        }
        #endregion

        #region 8. Walkable Buildings (JMAF & Apprentice School)
        private static void BuildWalkableBuilding(
            string buildingName,
            Vector3 position,
            Vector3 size,
            Transform parent,
            Material concreteMat,
            Material steelMat,
            Material safetyAmberMat,
            AccentPalette accents)
        {
            Transform root = CreateGroup(buildingName, position, parent);

            float w = size.x;
            float h = size.y;
            float d = size.z;
            const float wallThick = 0.45f;

            // Walkable ground-flush floor slab (top at y = 0.05)
            CreateSolidBox($"{buildingName}_Floor", root, new Vector3(0f, -0.05f, 0f), new Vector3(w, 0.2f, d), concreteMat);

            // Left, Right, Back walls (front +Z completely open for unobstructed walkable entry)
            CreateSolidBox($"{buildingName}_LeftWall", root, new Vector3(-w * 0.5f + wallThick * 0.5f, h * 0.5f, 0f), new Vector3(wallThick, h, d), concreteMat);
            CreateSolidBox($"{buildingName}_RightWall", root, new Vector3(w * 0.5f - wallThick * 0.5f, h * 0.5f, 0f), new Vector3(wallThick, h, d), concreteMat);
            CreateSolidBox($"{buildingName}_BackWall", root, new Vector3(0f, h * 0.5f, -d * 0.5f + wallThick * 0.5f), new Vector3(w - wallThick * 2f, h, wallThick), concreteMat);

            // Overhead doorway header & framing pilasters on front (+Z), leaving wide open center doorway
            float pilasterWidth = 2.2f;
            CreateSolidBox($"{buildingName}_FrontPilaster_L", root, new Vector3(-w * 0.5f + pilasterWidth * 0.5f, h * 0.5f, d * 0.5f - wallThick * 0.5f), new Vector3(pilasterWidth, h, wallThick), steelMat);
            CreateSolidBox($"{buildingName}_FrontPilaster_R", root, new Vector3(w * 0.5f - pilasterWidth * 0.5f, h * 0.5f, d * 0.5f - wallThick * 0.5f), new Vector3(pilasterWidth, h, wallThick), steelMat);
            CreateSolidBox($"{buildingName}_FrontHeader", root, new Vector3(0f, h - 0.8f, d * 0.5f - wallThick * 0.5f), new Vector3(w - pilasterWidth * 2f, 1.6f, wallThick), steelMat);
            CreateDecorativeBox($"{buildingName}_SignBand", root, new Vector3(0f, h - 0.8f, d * 0.5f + 0.05f), new Vector3(w * 0.5f, 0.7f, 0.1f), safetyAmberMat);

            // Roof
            CreateSolidBox($"{buildingName}_Roof", root, new Vector3(0f, h + 0.25f, 0f), new Vector3(w + 0.8f, 0.5f, d + 0.8f), accents.DarkRoof);

            // Interior Workbenches along left, right, and back interior walls
            BuildWorkbench($"{buildingName}_Bench_Back_1", root, new Vector3(-3.2f, 0.05f, -d * 0.5f + 1.6f), 3.6f, steelMat, accents.Timber);
            BuildWorkbench($"{buildingName}_Bench_Back_2", root, new Vector3(3.2f, 0.05f, -d * 0.5f + 1.6f), 3.6f, steelMat, accents.Timber);
            BuildWorkbench($"{buildingName}_Bench_Left", root, new Vector3(-w * 0.5f + 1.6f, 0.05f, 0.5f), 4.0f, steelMat, accents.Timber, true);
            BuildWorkbench($"{buildingName}_Bench_Right", root, new Vector3(w * 0.5f - 1.6f, 0.05f, 0.5f), 4.0f, steelMat, accents.Timber, true);
        }

        private static void BuildWorkbench(
            string name,
            Transform parent,
            Vector3 localPos,
            float length,
            Material legMat,
            Material topMat,
            bool rotate90 = false)
        {
            Transform bench = CreateGroup(name, localPos, parent);
            if (rotate90)
            {
                bench.localRotation = Quaternion.Euler(0f, 90f, 0f);
            }

            const float depth = 1.1f;
            const float topY = 0.9f;

            CreateSolidBox("Top", bench, new Vector3(0f, topY, 0f), new Vector3(length, 0.12f, depth), topMat);
            float legX = length * 0.5f - 0.18f;
            float legZ = depth * 0.5f - 0.15f;
            CreateSolidBox("Leg_FL", bench, new Vector3(-legX, topY * 0.5f, legZ), new Vector3(0.14f, topY, 0.14f), legMat);
            CreateSolidBox("Leg_FR", bench, new Vector3(legX, topY * 0.5f, legZ), new Vector3(0.14f, topY, 0.14f), legMat);
            CreateSolidBox("Leg_BL", bench, new Vector3(-legX, topY * 0.5f, -legZ), new Vector3(0.14f, topY, 0.14f), legMat);
            CreateSolidBox("Leg_BR", bench, new Vector3(legX, topY * 0.5f, -legZ), new Vector3(0.14f, topY, 0.14f), legMat);
        }
        #endregion

        #region Primitive Helpers
        private static Transform CreateGroup(string name, Vector3 localPosition, Transform parent)
        {
            GameObject go = new GameObject(name);
            if (parent != null)
            {
                go.transform.SetParent(parent, false);
            }
            go.transform.localPosition = localPosition;
            return go.transform;
        }

        private static GameObject CreateSolidBox(string name, Transform parent, Vector3 localPos, Vector3 localScale, Material mat)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = localScale;
            ApplyMaterial(go, mat);
            return go;
        }

        private static GameObject CreateDecorativeBox(string name, Transform parent, Vector3 localPos, Vector3 localScale, Material mat)
        {
            GameObject go = CreateSolidBox(name, parent, localPos, localScale, mat);
            Collider col = go.GetComponent<Collider>();
            if (col != null)
            {
                Object.DestroyImmediate(col);
            }
            return go;
        }

        private static GameObject CreateSolidCylinder(string name, Transform parent, Vector3 localPos, Vector3 localScale, Material mat)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = localScale;
            ApplyMaterial(go, mat);
            ReplaceWithBoxCollider(go);
            return go;
        }

        private static void ReplaceWithBoxCollider(GameObject go)
        {
            Collider existing = go.GetComponent<Collider>();
            if (existing != null && !(existing is BoxCollider))
            {
                Object.DestroyImmediate(existing);
                go.AddComponent<BoxCollider>();
            }
            else if (existing == null)
            {
                go.AddComponent<BoxCollider>();
            }
        }

        private static void ApplyMaterial(GameObject go, Material mat)
        {
            if (mat == null)
            {
                return;
            }

            Renderer renderer = go.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.sharedMaterial = mat;
            }
        }
        #endregion
    }
}
