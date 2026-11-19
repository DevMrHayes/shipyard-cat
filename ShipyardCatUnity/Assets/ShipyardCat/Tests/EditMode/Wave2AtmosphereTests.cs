using NUnit.Framework;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace ShipyardCat.Tests
{
    public class Wave2AtmosphereTests
    {
        [Test]
        public void Verify_ZeroCylinderPrimitivePuddlesExist_AndOrganicPuddlesAndReflectionProbePresent()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            GameObject puddlesRoot = GameObject.Find("WetPuddles");
            Assert.IsNotNull(puddlesRoot, "WetPuddles root missing.");
            MeshFilter[] filters = puddlesRoot.GetComponentsInChildren<MeshFilter>(true);
            Assert.GreaterOrEqual(filters.Length, 12, "Expected organic wet puddle quads.");

            foreach (MeshFilter mf in filters)
            {
                Assert.IsNotNull(mf.sharedMesh);
                Assert.AreNotEqual("Cylinder", mf.sharedMesh.name, $"Puddle '{mf.gameObject.name}' must use organic feathered Quad, not flat Cylinder.");
                MeshRenderer mr = mf.GetComponent<MeshRenderer>();
                Assert.IsNotNull(mr.sharedMaterial);
                Assert.IsNotNull(mr.sharedMaterial.GetTexture("_BaseMap"), $"Puddle '{mf.gameObject.name}' missing feathered mask texture.");
            }

            GameObject probeGo = GameObject.Find("Yard_ReflectionProbe");
            Assert.IsNotNull(probeGo, "Yard_ReflectionProbe missing.");
            ReflectionProbe probe = probeGo.GetComponent<ReflectionProbe>();
            Assert.IsNotNull(probe, "Yard_ReflectionProbe component missing.");

            byte[] puddleBytes = System.IO.File.ReadAllBytes("Assets/ShipyardCat/Materials/WetPuddle_OrganicMask_512.png");
            Texture2D puddleTex = new Texture2D(2, 2);
            puddleTex.LoadImage(puddleBytes);
            Color32[] puddlePixels = puddleTex.GetPixels32();
            int maxAlpha = 0;
            for (int i = 0; i < puddlePixels.Length; i++)
            {
                if (puddlePixels[i].a > maxAlpha) maxAlpha = puddlePixels[i].a;
            }
            Object.DestroyImmediate(puddleTex);
            Assert.GreaterOrEqual(maxAlpha, 200, "WetPuddle_OrganicMask_512.png alpha must reach >= 200 in puddle interiors.");

            byte[] albaBytes = System.IO.File.ReadAllBytes("Assets/ShipyardCat/Materials/Alba_Tuxedo_Baked.png");
            Texture2D albaTex = new Texture2D(2, 2);
            albaTex.LoadImage(albaBytes);
            Color32[] albaPixels = albaTex.GetPixels32();
            int whiteCount = 0;
            int darkCount = 0;
            for (int i = 0; i < albaPixels.Length; i++)
            {
                if (albaPixels[i].r > 200 && albaPixels[i].g > 200 && albaPixels[i].b > 200) whiteCount++;
                if (albaPixels[i].r < 40 && albaPixels[i].g < 40 && albaPixels[i].b < 40) darkCount++;
            }
            Object.DestroyImmediate(albaTex);
            Assert.Greater(whiteCount, 1500, "Alba_Tuxedo_Baked.png must include white tuxedo paws/bib/muzzle pixels.");
            Assert.Greater(darkCount, 10000, "Alba_Tuxedo_Baked.png must include sleek dark charcoal dorsal coat pixels.");
        }

        [Test]
        public void Verify_DD1CulvertMurkySumpDiamondCatwalkAndWallSconcesPresent()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            Assert.IsNotNull(GameObject.Find("DD1_DrainageCulvert"), "DD1_DrainageCulvert missing.");

            GameObject sump = GameObject.Find("DD1_ToxicSump_Puddle");
            Assert.IsNotNull(sump, "DD1_ToxicSump_Puddle missing.");
            MeshRenderer sumpMr = sump.GetComponent<MeshRenderer>();
            Assert.IsNotNull(sumpMr.sharedMaterial);
            Assert.IsNotNull(sumpMr.sharedMaterial.GetTexture("_BaseMap"), "Toxic sump must use murky procedural drainage texture.");

            GameObject catwalkDeck = GameObject.Find("DD1_CatwalkDeck");
            Assert.IsNotNull(catwalkDeck, "DD1_CatwalkDeck missing.");
            MeshRenderer catMr = catwalkDeck.GetComponent<MeshRenderer>();
            Assert.IsNotNull(catMr.sharedMaterial);
            Assert.AreEqual("Mat_Catwalk_DiamondPlate", catMr.sharedMaterial.name);

            GameObject sconces = GameObject.Find("DD1_WallSconces");
            Assert.IsNotNull(sconces, "DD1_WallSconces missing.");
            Light[] sconceLights = sconces.GetComponentsInChildren<Light>(true);
            Assert.GreaterOrEqual(sconceLights.Length, 8, "Expected 2200K warm sconces spaced along both DD1 retaining walls.");
        }

        [Test]
        public void Verify_AtmosphereVfxRespects650ParticleWebGLBudget()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/ShipyardMain.unity", OpenSceneMode.Single);

            ParticleSystem[] allSystems = Object.FindObjectsByType<ParticleSystem>(FindObjectsSortMode.None);
            Assert.GreaterOrEqual(allSystems.Length, 8, "Expected welding sparks, steam vents, and arena splash particle systems.");

            int totalMaxParticles = 0;
            foreach (ParticleSystem ps in allSystems)
            {
                totalMaxParticles += ps.main.maxParticles;
            }

            Assert.LessOrEqual(totalMaxParticles, 650, $"Total maxParticles ({totalMaxParticles}) exceeded 650 WebGL performance cap.");
        }
    }
}
