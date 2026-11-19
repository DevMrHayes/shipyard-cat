using UnityEngine;

namespace ShipyardCat.Editor
{
    public static class CarrierAndCraneBuilder
    {
        private const string RootGroupName = "Crane_Ship_HeroSignage";

        public static void BuildCraneSignageAndShipDetails(
            Transform worldRoot,
            Material steelMat,
            Material safetyAmberMat)
        {
            if (worldRoot == null)
            {
                Debug.LogWarning("[CarrierAndCraneBuilder] worldRoot is null. Aborting build.");
                return;
            }

            Transform existing = worldRoot.Find(RootGroupName);
            if (existing != null)
            {
                Object.DestroyImmediate(existing.gameObject);
            }

            GameObject rootGo = new GameObject(RootGroupName);
            rootGo.transform.SetParent(worldRoot, false);
            Transform root = rootGo.transform;

            Material resolvedSteelMat = steelMat != null
                ? steelMat
                : CreateUrpLitMaterial("DarkSteel_Fallback", new Color(0.16f, 0.19f, 0.22f), 0.75f, 0.45f, false, Color.black);

            Material resolvedAmberMat = safetyAmberMat != null
                ? safetyAmberMat
                : CreateUrpLitMaterial("SafetyAmber_Fallback", new Color(0.95f, 0.62f, 0.05f), 0.2f, 0.5f, false, Color.black);

            Material darkSteelLatticeMat = CreateUrpLitMaterial(
                "Hammerhead_DarkSteel",
                new Color(0.11f, 0.13f, 0.15f),
                0.8f,
                0.4f,
                false,
                Color.black);

            Material counterweightMat = CreateUrpLitMaterial(
                "Hammerhead_Counterweight",
                new Color(0.28f, 0.30f, 0.32f),
                0.1f,
                0.2f,
                false,
                Color.black);

            Material emissiveBeaconMat = CreateUrpLitMaterial(
                "CVN80_DeckBeacon_EmissiveAmber",
                new Color(1.0f, 0.82f, 0.12f),
                0.1f,
                0.85f,
                true,
                new Color(1.0f, 0.72f, 0.05f) * 3.2f);

            BuildBigBlueSigns(root);
            BuildCarrierIslandHullNumberAndBeacons(root, emissiveBeaconMat);
            BuildHammerheadJibCrane(root, darkSteelLatticeMat, resolvedSteelMat, resolvedAmberMat, counterweightMat);
        }

        private static void BuildBigBlueSigns(Transform parent)
        {
            var (bigBlueTex, _) = SignTextureBaker.BakeAllSignTextures();
            Material signMat = CreateCutoutSignMaterial(
                "Mat_BigBlue_Sign_Cutout",
                bigBlueTex,
                new Color(0.70f, 0.82f, 0.94f) * 0.42f);

            const float craneCenterX = -115f;
            const float girderY = 76f;
            const float craneCenterZ = 210f;
            // Twin girders at Z=210 +- 4.5, width 3.2 -> South exterior face at 203.9, North exterior face at 216.1
            const float girderExteriorOffset = 6.28f;
            var signScale = new Vector3(56f, 5.4f, 1f);

            // Quad front (-Z) faces South toward yard
            CreateWorldTextSign(
                parent,
                "BigBlue_Sign_South",
                new Vector3(craneCenterX, girderY, craneCenterZ - girderExteriorOffset),
                Quaternion.identity,
                signScale,
                signMat);

            // Rotated 180 deg so front faces North (+Z) toward river, occluded by steel girders from South view
            CreateWorldTextSign(
                parent,
                "BigBlue_Sign_North",
                new Vector3(craneCenterX, girderY, craneCenterZ + girderExteriorOffset),
                Quaternion.Euler(0f, 180f, 0f),
                signScale,
                signMat);
        }

        private static void BuildCarrierIslandHullNumberAndBeacons(Transform parent, Material emissiveBeaconMat)
        {
            var (_, hull80Tex) = SignTextureBaker.BakeAllSignTextures();
            Material hullMat = CreateCutoutSignMaterial(
                "Mat_CVN80_Hull80_Cutout",
                hull80Tex,
                new Color(0.85f, 0.90f, 0.95f) * 0.35f);

            GameObject carrierDetails = new GameObject("CVN80_HeroDetails");
            carrierDetails.transform.SetParent(parent, false);

            // Island_Base world span: X:[-101.75,-93.25], Y:[6.9,14.9], Z:[168.0,188.0]
            // Mount strictly proud (+0.18m) of exterior Island_Base walls so ZWrite/ZTest occludes properly behind foreground buildings & catwalk
            CreateWorldTextSign(
                carrierDetails.transform,
                "CVN80_Island_HullNumber_80",
                new Vector3(-97.5f, 11.4f, 167.80f),
                Quaternion.identity,
                new Vector3(6.6f, 6.6f, 1f),
                hullMat);

            CreateWorldTextSign(
                carrierDetails.transform,
                "CVN80_Island_HullNumber_80_East",
                new Vector3(-92.95f, 11.4f, 178.0f),
                Quaternion.Euler(0f, -90f, 0f),
                new Vector3(7.0f, 7.0f, 1f),
                hullMat);

            // Flight-deck edge beacon lights along CVN-80 port & starboard edges
            GameObject beaconsGroup = new GameObject("CVN80_FlightDeck_Beacons");
            beaconsGroup.transform.SetParent(carrierDetails.transform, false);

            const float carrierCenterX = -115f;
            const float carrierCenterZ = 220f;
            const float deckEdgeY = 12.2f;
            const float halfBeam = 24f;
            const float halfLength = 120f;
            const float spacing = 20f;

            int index = 0;
            for (float z = carrierCenterZ - halfLength; z <= carrierCenterZ + halfLength; z += spacing)
            {
                CreateDeckBeacon(
                    beaconsGroup.transform,
                    $"CVN80_Beacon_Port_{index}",
                    new Vector3(carrierCenterX - halfBeam, deckEdgeY, z),
                    emissiveBeaconMat);

                CreateDeckBeacon(
                    beaconsGroup.transform,
                    $"CVN80_Beacon_Starboard_{index}",
                    new Vector3(carrierCenterX + halfBeam, deckEdgeY, z),
                    emissiveBeaconMat);

                index++;
            }

            // Bow & stern transverse edge beacons
            for (float xOffset = -16f; xOffset <= 16f; xOffset += 8f)
            {
                CreateDeckBeacon(
                    beaconsGroup.transform,
                    $"CVN80_Beacon_Stern_{index}",
                    new Vector3(carrierCenterX + xOffset, deckEdgeY, carrierCenterZ - halfLength),
                    emissiveBeaconMat);

                CreateDeckBeacon(
                    beaconsGroup.transform,
                    $"CVN80_Beacon_Bow_{index}",
                    new Vector3(carrierCenterX + xOffset, deckEdgeY, carrierCenterZ + halfLength),
                    emissiveBeaconMat);

                index++;
            }
        }

        private static void BuildHammerheadJibCrane(
            Transform parent,
            Material darkSteelMat,
            Material accentSteelMat,
            Material safetyAmberMat,
            Material counterweightMat)
        {
            GameObject craneRoot = new GameObject("Hammerhead_JibCrane");
            craneRoot.transform.SetParent(parent, false);
            craneRoot.transform.position = new Vector3(-80f, 0f, 125f);

            const float towerHeight = 48f;
            const float towerHalfWidth = 1.3f;
            const float jibLength = 34f;
            const float counterJibLength = 13f;
            const float jibWidth = 2.0f;
            const float jibHeight = 2.2f;
            const float apexHeight = 7.5f;

            // 1. Concrete/Steel Pedestal Foundation
            CreatePrimitive(
                craneRoot.transform,
                "Base_Pedestal",
                PrimitiveType.Cube,
                new Vector3(0f, 1.0f, 0f),
                Quaternion.identity,
                new Vector3(4.6f, 2.0f, 4.6f),
                accentSteelMat);

            // 2. 48m Dark Steel Lattice Tower
            Transform tower = new GameObject("Lattice_Tower").transform;
            tower.SetParent(craneRoot.transform, false);

            Vector2[] cornerSigns =
            {
                new Vector2(-1f, -1f),
                new Vector2( 1f, -1f),
                new Vector2( 1f,  1f),
                new Vector2(-1f,  1f)
            };

            for (int i = 0; i < cornerSigns.Length; i++)
            {
                Vector2 c = cornerSigns[i];
                CreatePrimitive(
                    tower,
                    $"Tower_Chord_{i}",
                    PrimitiveType.Cube,
                    new Vector3(c.x * towerHalfWidth, towerHeight * 0.5f, c.y * towerHalfWidth),
                    Quaternion.identity,
                    new Vector3(0.28f, towerHeight, 0.28f),
                    darkSteelMat);
            }

            const int towerBays = 8;
            float bayHeight = towerHeight / towerBays;
            float span = towerHalfWidth * 2f;

            for (int b = 0; b < towerBays; b++)
            {
                float yBottom = b * bayHeight;
                float yTop = (b + 1) * bayHeight;
                float yMid = (yBottom + yTop) * 0.5f;

                // Horizontal girts around each bay top
                CreateSpanBeam(tower, $"Tower_Girt_N_{b}", new Vector3(-towerHalfWidth, yTop, towerHalfWidth), new Vector3(towerHalfWidth, yTop, towerHalfWidth), 0.16f, darkSteelMat);
                CreateSpanBeam(tower, $"Tower_Girt_S_{b}", new Vector3(-towerHalfWidth, yTop, -towerHalfWidth), new Vector3(towerHalfWidth, yTop, -towerHalfWidth), 0.16f, darkSteelMat);
                CreateSpanBeam(tower, $"Tower_Girt_E_{b}", new Vector3(towerHalfWidth, yTop, -towerHalfWidth), new Vector3(towerHalfWidth, yTop, towerHalfWidth), 0.16f, darkSteelMat);
                CreateSpanBeam(tower, $"Tower_Girt_W_{b}", new Vector3(-towerHalfWidth, yTop, -towerHalfWidth), new Vector3(-towerHalfWidth, yTop, towerHalfWidth), 0.16f, darkSteelMat);

                // Diagonal lattice X-bracing on all 4 faces
                bool flip = (b % 2) == 0;
                float xA = flip ? -towerHalfWidth : towerHalfWidth;
                float xB = -xA;
                float zA = flip ? -towerHalfWidth : towerHalfWidth;
                float zB = -zA;

                CreateSpanBeam(tower, $"Tower_Diag_N_{b}", new Vector3(xA, yBottom, towerHalfWidth), new Vector3(xB, yTop, towerHalfWidth), 0.12f, darkSteelMat);
                CreateSpanBeam(tower, $"Tower_Diag_S_{b}", new Vector3(xB, yBottom, -towerHalfWidth), new Vector3(xA, yTop, -towerHalfWidth), 0.12f, darkSteelMat);
                CreateSpanBeam(tower, $"Tower_Diag_E_{b}", new Vector3(towerHalfWidth, yBottom, zA), new Vector3(towerHalfWidth, yTop, zB), 0.12f, darkSteelMat);
                CreateSpanBeam(tower, $"Tower_Diag_W_{b}", new Vector3(-towerHalfWidth, yBottom, zB), new Vector3(-towerHalfWidth, yTop, zA), 0.12f, darkSteelMat);

                if (b == towerBays - 1)
                {
                    // Upper warning band collar
                    CreatePrimitive(
                        tower,
                        "Tower_SafetyCollar",
                        PrimitiveType.Cube,
                        new Vector3(0f, yMid, 0f),
                        Quaternion.identity,
                        new Vector3(span + 0.35f, 0.35f, span + 0.35f),
                        safetyAmberMat);
                }
            }

            // 3. Rotating Upper Assembly (Slewing Ring + Jib + Counter-Jib + Apex + Hook)
            Transform upperPivot = new GameObject("Rotating_Upper_Assembly").transform;
            upperPivot.SetParent(craneRoot.transform, false);
            upperPivot.localPosition = new Vector3(0f, towerHeight, 0f);
            upperPivot.localRotation = Quaternion.Euler(0f, -28f, 0f);

            // Slewing turntable & machinery ring
            CreatePrimitive(
                upperPivot,
                "Slewing_Ring",
                PrimitiveType.Cylinder,
                new Vector3(0f, 0.35f, 0f),
                Quaternion.identity,
                new Vector3(3.0f, 0.35f, 3.0f),
                accentSteelMat);

            // Operator cab
            CreatePrimitive(
                upperPivot,
                "Operator_Cab",
                PrimitiveType.Cube,
                new Vector3(1.65f, 1.4f, 0.6f),
                Quaternion.identity,
                new Vector3(1.6f, 2.2f, 2.2f),
                safetyAmberMat);

            // Apex mast above turntable
            Vector3 apexTop = new Vector3(0f, apexHeight, 0f);
            CreateSpanBeam(upperPivot, "Apex_Chord_FL", new Vector3(-1.0f, 0.5f, 1.0f), apexTop, 0.2f, darkSteelMat);
            CreateSpanBeam(upperPivot, "Apex_Chord_FR", new Vector3(1.0f, 0.5f, 1.0f), apexTop, 0.2f, darkSteelMat);
            CreateSpanBeam(upperPivot, "Apex_Chord_RL", new Vector3(-1.0f, 0.5f, -1.0f), apexTop, 0.2f, darkSteelMat);
            CreateSpanBeam(upperPivot, "Apex_Chord_RR", new Vector3(1.0f, 0.5f, -1.0f), apexTop, 0.2f, darkSteelMat);

            // 4. Horizontal Jib Boom (34m forward along +Z)
            Transform jib = new GameObject("Horizontal_JibBoom_34m").transform;
            jib.SetParent(upperPivot, false);

            float halfJibW = jibWidth * 0.5f;
            float jibBaseY = 0.8f;
            float jibTopY = jibBaseY + jibHeight;

            // Lower chords
            CreateSpanBeam(jib, "Jib_BottomChord_L", new Vector3(-halfJibW, jibBaseY, 0f), new Vector3(-halfJibW, jibBaseY, jibLength), 0.18f, darkSteelMat);
            CreateSpanBeam(jib, "Jib_BottomChord_R", new Vector3(halfJibW, jibBaseY, 0f), new Vector3(halfJibW, jibBaseY, jibLength), 0.18f, darkSteelMat);
            // Upper ridge chord (triangular truss jib)
            CreateSpanBeam(jib, "Jib_TopChord", new Vector3(0f, jibTopY, 0f), new Vector3(0f, jibTopY, jibLength), 0.20f, darkSteelMat);

            const int jibBays = 12;
            float jibBayLen = jibLength / jibBays;
            for (int i = 0; i < jibBays; i++)
            {
                float z0 = i * jibBayLen;
                float z1 = (i + 1) * jibBayLen;

                CreateSpanBeam(jib, $"Jib_Cross_{i}", new Vector3(-halfJibW, jibBaseY, z1), new Vector3(halfJibW, jibBaseY, z1), 0.12f, darkSteelMat);
                CreateSpanBeam(jib, $"Jib_WebL_{i}", new Vector3(-halfJibW, jibBaseY, z0), new Vector3(0f, jibTopY, z1), 0.11f, darkSteelMat);
                CreateSpanBeam(jib, $"Jib_WebR_{i}", new Vector3(halfJibW, jibBaseY, z0), new Vector3(0f, jibTopY, z1), 0.11f, darkSteelMat);
            }

            // Counter-jib (-Z)
            CreateSpanBeam(jib, "CounterJib_Chord_L", new Vector3(-halfJibW, jibBaseY, 0f), new Vector3(-halfJibW, jibBaseY, -counterJibLength), 0.22f, darkSteelMat);
            CreateSpanBeam(jib, "CounterJib_Chord_R", new Vector3(halfJibW, jibBaseY, 0f), new Vector3(halfJibW, jibBaseY, -counterJibLength), 0.22f, darkSteelMat);
            CreateSpanBeam(jib, "CounterJib_EndBeam", new Vector3(-halfJibW, jibBaseY, -counterJibLength), new Vector3(halfJibW, jibBaseY, -counterJibLength), 0.22f, darkSteelMat);

            // Forestay and backstay tension cables from apex
            CreateSpanBeam(upperPivot, "Forestay_Cable_Main", apexTop, new Vector3(0f, jibTopY, jibLength * 0.72f), 0.08f, accentSteelMat);
            CreateSpanBeam(upperPivot, "Forestay_Cable_Tip", apexTop, new Vector3(0f, jibTopY, jibLength * 0.96f), 0.07f, accentSteelMat);
            CreateSpanBeam(upperPivot, "Backstay_Cable_L", apexTop, new Vector3(-halfJibW, jibBaseY, -counterJibLength + 0.5f), 0.09f, accentSteelMat);
            CreateSpanBeam(upperPivot, "Backstay_Cable_R", apexTop, new Vector3(halfJibW, jibBaseY, -counterJibLength + 0.5f), 0.09f, accentSteelMat);

            // 5. Counterweight Block
            Transform counterweight = new GameObject("Counterweight_Assembly").transform;
            counterweight.SetParent(upperPivot, false);
            counterweight.localPosition = new Vector3(0f, jibBaseY + 0.9f, -counterJibLength + 2.2f);

            CreatePrimitive(
                counterweight,
                "Counterweight_Block",
                PrimitiveType.Cube,
                Vector3.zero,
                Quaternion.identity,
                new Vector3(2.8f, 2.6f, 3.6f),
                counterweightMat);

            CreatePrimitive(
                counterweight,
                "Counterweight_WarningStripe",
                PrimitiveType.Cube,
                new Vector3(0f, 0f, -1.82f),
                Quaternion.identity,
                new Vector3(2.84f, 0.5f, 0.08f),
                safetyAmberMat);

            // 6. Trolley & Hanging Hook Cable
            const float trolleyZ = 24.5f;
            const float cableLength = 22f;

            CreatePrimitive(
                upperPivot,
                "Jib_Trolley",
                PrimitiveType.Cube,
                new Vector3(0f, jibBaseY - 0.15f, trolleyZ),
                Quaternion.identity,
                new Vector3(1.6f, 0.55f, 1.8f),
                safetyAmberMat);

            CreatePrimitive(
                upperPivot,
                "Hook_Cable",
                PrimitiveType.Cylinder,
                new Vector3(0f, jibBaseY - 0.4f - cableLength * 0.5f, trolleyZ),
                Quaternion.identity,
                new Vector3(0.10f, cableLength * 0.5f, 0.10f),
                accentSteelMat);

            CreatePrimitive(
                upperPivot,
                "Hook_PulleyBlock",
                PrimitiveType.Cube,
                new Vector3(0f, jibBaseY - 0.4f - cableLength, trolleyZ),
                Quaternion.identity,
                new Vector3(0.75f, 1.05f, 0.55f),
                safetyAmberMat);

            CreatePrimitive(
                upperPivot,
                "Hook_Claw",
                PrimitiveType.Cylinder,
                new Vector3(0f, jibBaseY - 0.4f - cableLength - 0.75f, trolleyZ),
                Quaternion.Euler(0f, 0f, 90f),
                new Vector3(0.28f, 0.32f, 0.28f),
                darkSteelMat);
        }

        private static void CreateWorldTextSign(
            Transform parent,
            string objectName,
            Vector3 position,
            Quaternion rotation,
            Vector3 scale,
            Material material)
        {
            GameObject signGo = GameObject.CreatePrimitive(PrimitiveType.Quad);
            signGo.name = objectName;
            signGo.transform.SetParent(parent, false);
            signGo.transform.position = position;
            signGo.transform.rotation = rotation;
            signGo.transform.localScale = scale;

            MeshRenderer meshRenderer = signGo.GetComponent<MeshRenderer>();
            if (meshRenderer != null && material != null)
            {
                meshRenderer.sharedMaterial = material;
                meshRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                meshRenderer.receiveShadows = true;
            }

            RemoveAllColliders(signGo);
        }

        private static Material CreateCutoutSignMaterial(string matName, Texture2D signTex, Color emissionColor)
        {
            string matPath = $"Assets/ShipyardCat/Materials/{matName}.mat";
            Material mat = UnityEditor.AssetDatabase.LoadAssetAtPath<Material>(matPath);
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");

            if (mat == null)
            {
                mat = new Material(shader) { name = matName };
                UnityEditor.AssetDatabase.CreateAsset(mat, matPath);
            }

            mat.shader = shader;
            if (mat.HasProperty("_BaseMap")) mat.SetTexture("_BaseMap", signTex);
            if (mat.HasProperty("_MainTex")) mat.SetTexture("_MainTex", signTex);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", Color.white);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", Color.white);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0.05f);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.35f);

            // Enforce depth-tested, depth-writing, backface-culled AlphaTest cutout so distant signs never bleed backwards through hulls/girders
            if (mat.HasProperty("_Surface")) mat.SetFloat("_Surface", 0.0f);
            if (mat.HasProperty("_AlphaClip")) mat.SetFloat("_AlphaClip", 1.0f);
            if (mat.HasProperty("_Cutoff")) mat.SetFloat("_Cutoff", 0.45f);
            if (mat.HasProperty("_Cull")) mat.SetFloat("_Cull", 2.0f);
            if (mat.HasProperty("_ZWrite")) mat.SetFloat("_ZWrite", 1.0f);
            mat.EnableKeyword("_ALPHATEST_ON");
            mat.DisableKeyword("_SURFACE_TYPE_TRANSPARENT");
            mat.renderQueue = (int)UnityEngine.Rendering.RenderQueue.AlphaTest;

            if (mat.HasProperty("_EmissionColor"))
            {
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", emissionColor);
                if (mat.HasProperty("_EmissionMap")) mat.SetTexture("_EmissionMap", signTex);
            }

            UnityEditor.EditorUtility.SetDirty(mat);
            return mat;
        }

        private static void CreateDeckBeacon(
            Transform parent,
            string name,
            Vector3 position,
            Material emissiveMat)
        {
            CreatePrimitive(
                parent,
                name,
                PrimitiveType.Sphere,
                position,
                Quaternion.identity,
                new Vector3(0.45f, 0.45f, 0.45f),
                emissiveMat);
        }

        private static void CreateSpanBeam(
            Transform parent,
            string name,
            Vector3 start,
            Vector3 end,
            float thickness,
            Material material)
        {
            Vector3 delta = end - start;
            float length = delta.magnitude;
            if (length <= 0.001f)
            {
                return;
            }

            Vector3 mid = (start + end) * 0.5f;
            Quaternion rot = Quaternion.LookRotation(delta.normalized, Vector3.up);

            CreatePrimitive(
                parent,
                name,
                PrimitiveType.Cube,
                mid,
                rot,
                new Vector3(thickness, thickness, length),
                material);
        }

        private static GameObject CreatePrimitive(
            Transform parent,
            string name,
            PrimitiveType primitiveType,
            Vector3 localPosition,
            Quaternion localRotation,
            Vector3 localScale,
            Material material)
        {
            GameObject go = GameObject.CreatePrimitive(primitiveType);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.transform.localRotation = localRotation;
            go.transform.localScale = localScale;

            RemoveAllColliders(go);

            Renderer renderer = go.GetComponent<Renderer>();
            if (renderer != null && material != null)
            {
                renderer.sharedMaterial = material;
            }

            return go;
        }

        private static void RemoveAllColliders(GameObject target)
        {
            Collider[] colliders = target.GetComponentsInChildren<Collider>(true);
            for (int i = 0; i < colliders.Length; i++)
            {
                if (colliders[i] != null)
                {
                    Object.DestroyImmediate(colliders[i]);
                }
            }
        }

        private static Material CreateUrpLitMaterial(
            string matName,
            Color baseColor,
            float metallic,
            float smoothness,
            bool enableEmission,
            Color emissionColor)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            Material mat = new Material(shader)
            {
                name = matName
            };

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
            if (mat.HasProperty("_Glossiness"))
            {
                mat.SetFloat("_Glossiness", smoothness);
            }

            if (enableEmission && mat.HasProperty("_EmissionColor"))
            {
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", emissionColor);
                mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.BakedEmissive;
            }

            return mat;
        }
    }
}
