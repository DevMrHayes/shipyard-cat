using System.Collections.Generic;
using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;
using ShipyardCat.AI;
using ShipyardCat.Player;

namespace ShipyardCat.Tests
{
    public class Wave1FixesTests
    {
        private static Transform FindDescendant(Transform root, string childName)
        {
            foreach (Transform t in root.GetComponentsInChildren<Transform>(true))
            {
                if (t.name == childName) return t;
            }
            return null;
        }

        [Test]
        public void Verify_WorldSigns_UseDepthTestedBackfaceCulledUrpMaterials_NoLegacyTextMesh()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            string[] signNames =
            {
                "BigBlue_Sign_South",
                "BigBlue_Sign_North",
                "CVN80_Island_HullNumber_80",
                "CVN80_Island_HullNumber_80_East"
            };

            foreach (string signName in signNames)
            {
                GameObject go = GameObject.Find(signName);
                Assert.IsNotNull(go, $"Missing signage object '{signName}'.");
                Assert.IsNull(go.GetComponent<TextMesh>(), $"'{signName}' must NOT use legacy TextMesh / GUI Text Shader.");

                MeshRenderer mr = go.GetComponent<MeshRenderer>();
                Assert.IsNotNull(mr, $"'{signName}' missing MeshRenderer.");
                Assert.IsNotNull(mr.sharedMaterial, $"'{signName}' missing sharedMaterial.");
                Assert.AreNotEqual("GUI/Text Shader", mr.sharedMaterial.shader.name);
                if (mr.sharedMaterial.HasProperty("_Cull"))
                {
                    Assert.AreEqual(2f, mr.sharedMaterial.GetFloat("_Cull"), 0.01f, $"'{signName}' must enforce Cull Back (2).");
                }
                if (mr.sharedMaterial.HasProperty("_ZWrite"))
                {
                    Assert.AreEqual(1f, mr.sharedMaterial.GetFloat("_ZWrite"), 0.01f, $"'{signName}' must write depth buffer (_ZWrite = 1).");
                }
            }
        }

        [Test]
        public void Verify_CVN80HullNumeral_IsOutsideIslandBounds()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            GameObject islandBase = GameObject.Find("Island_Base");
            GameObject hull80South = GameObject.Find("CVN80_Island_HullNumber_80");
            GameObject hull80East = GameObject.Find("CVN80_Island_HullNumber_80_East");
            Assert.IsNotNull(islandBase, "Island_Base missing.");
            Assert.IsNotNull(hull80South, "CVN80_Island_HullNumber_80 missing.");
            Assert.IsNotNull(hull80East, "CVN80_Island_HullNumber_80_East missing.");

            Bounds islandBounds = islandBase.GetComponent<Renderer>().bounds;
            Assert.IsFalse(islandBounds.Contains(hull80South.transform.position), "CVN80 South '80' must sit outside Island_Base wall.");
            Assert.IsFalse(islandBounds.Contains(hull80East.transform.position), "CVN80 East '80' must sit outside Island_Base wall.");
        }

        [Test]
        public void Verify_CatwalkClearanceVolume_HasNoPropIntersections()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            GameObject catwalk = GameObject.Find("DD1_ElevatedCatwalk");
            Assert.IsNotNull(catwalk, "DD1_ElevatedCatwalk missing.");

            Bounds clearanceEnvelope = new Bounds(
                new Vector3(-24.0f, 4.2f, 21.0f),
                new Vector3(4.6f, 6.2f, 51.0f));

            string[] propsToCheck = { "Shipping_Containers", "Hazard_Drum_Clusters", "SodiumVaporLightPoles" };
            var hits = new List<string>();

            foreach (string groupName in propsToCheck)
            {
                GameObject group = GameObject.Find(groupName);
                Assert.IsNotNull(group, $"Prop group '{groupName}' missing.");

                foreach (Renderer r in group.GetComponentsInChildren<Renderer>(true))
                {
                    if (clearanceEnvelope.Intersects(r.bounds))
                    {
                        hits.Add($"{groupName}/{r.gameObject.name}");
                    }
                }
            }

            Assert.IsEmpty(hits, $"Catwalk clearance envelope intersected by props: {string.Join(", ", hits)}");
        }

        [Test]
        public void Verify_AlbaCollar_TracksNeckBoneWithin12cm_AndUsesBakedTuxedoMaterial()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            AlbaController alba = Object.FindAnyObjectByType<AlbaController>();
            Assert.IsNotNull(alba, "AlbaController missing.");
            AlbaVisualRig rig = alba.GetComponent<AlbaVisualRig>();
            Assert.IsNotNull(rig, "AlbaVisualRig missing.");

            rig.BuildOrRefreshVisuals();
            Transform neck = rig.ResolvedNeckBone;
            Transform collar = FindDescendant(alba.transform, "Alba_SafetyCollar");
            Assert.IsNotNull(neck, "Alba neck bone not resolved from cat.glb.");
            Assert.IsNotNull(collar, "Alba_SafetyCollar missing.");

            float dist = Vector3.Distance(collar.position, neck.position);
            Assert.LessOrEqual(dist, 0.12f, $"Collar center drifted {dist:F3}m from cat.glb neck bone.");

            SkinnedMeshRenderer smr = alba.GetComponentInChildren<SkinnedMeshRenderer>(true);
            Assert.IsNotNull(smr, "Alba SkinnedMeshRenderer missing.");
            Assert.IsNotNull(smr.sharedMaterial, "Alba tuxedo material null.");
            Assert.AreEqual("Alba_Tuxedo_Mat", smr.sharedMaterial.name, "Alba should use persisted baked Alba_Tuxedo_Mat.");
        }

        [Test]
        public void Verify_RatKingEyes_AreAnchoredToHeadBoneWithinCranialBounds_AndFurTexturePreserved()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            KingpinBossAI kingpin = Object.FindAnyObjectByType<KingpinBossAI>();
            Assert.IsNotNull(kingpin, "KingpinBossAI missing.");
            RatKingVisualController visual = kingpin.GetComponent<RatKingVisualController>();
            Assert.IsNotNull(visual, "RatKingVisualController missing.");

            visual.BuildOrRefreshVisuals();
            Transform head = visual.ResolvedHeadBone;
            Transform eyeL = FindDescendant(kingpin.transform, RatKingVisualController.EyeLeftName);
            Transform eyeR = FindDescendant(kingpin.transform, RatKingVisualController.EyeRightName);

            Assert.IsNotNull(head, "rat.glb Head bone not resolved.");
            Assert.IsNotNull(eyeL, "KingpinEye_L missing.");
            Assert.IsNotNull(eyeR, "KingpinEye_R missing.");

            float distL = Vector3.Distance(eyeL.position, head.position);
            float distR = Vector3.Distance(eyeR.position, head.position);
            Assert.LessOrEqual(distL, 0.38f, $"KingpinEye_L sits {distL:F3}m from skull bone.");
            Assert.LessOrEqual(distR, 0.38f, $"KingpinEye_R sits {distR:F3}m from skull bone.");

            SkinnedMeshRenderer smr = kingpin.GetComponentInChildren<SkinnedMeshRenderer>(true);
            Assert.IsNotNull(smr, "Rat King SkinnedMeshRenderer missing.");
            Assert.IsNotNull(smr.sharedMaterial, "Rat King fur material missing.");
            Texture baseMap = smr.sharedMaterial.HasProperty("_BaseMap") ? smr.sharedMaterial.GetTexture("_BaseMap") : null;
            Assert.IsNotNull(baseMap, "Rat King must preserve native rat.glb fur texture on _BaseMap.");
        }
    }
}
