using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using ShipyardCat.AI;
using ShipyardCat.Player;

namespace ShipyardCat
{
    namespace UI
    {
        [Serializable]
        public struct RadarBlip
        {
            public Vector2 normalizedOffset;
            public string kind;
        }

        [DisallowMultipleComponent]
        public class TacticalRadarController : MonoBehaviour
        {
            public const float DefaultRadarRadius = 45f;
            public const string KindRatPrey = "RatPrey";
            public const string KindMutantCat = "MutantCat";
            public const string KindKingpinBoss = "KingpinBoss";
            public const string KindLieutenantCobaltBoss = "LieutenantCobaltBoss";

            [SerializeField] private float radarRadius = DefaultRadarRadius;
            [SerializeField] private AlbaController alba;

            private readonly List<RatPreyAI> _ratPreys = new List<RatPreyAI>(64);
            private readonly List<MutantCatAI> _mutantCats = new List<MutantCatAI>(32);
            private readonly List<KingpinBossAI> _kingpinBosses = new List<KingpinBossAI>(4);
            private readonly List<LieutenantCobaltBossAI> _lieutenantCobaltBosses = new List<LieutenantCobaltBossAI>(4);
            private readonly List<RadarBlip> _blips = new List<RadarBlip>(128);

            public bool IsFullMapOpen { get; private set; }
            public float RadarRadius => radarRadius;

            private void Start()
            {
                RefreshTrackedTargets();
            }

            private void Update()
            {
                Keyboard keyboard = Keyboard.current;
                if (keyboard != null && keyboard.mKey.wasPressedThisFrame)
                {
                    ToggleFullMap();
                }

                _blips.Clear();

                if (alba == null || !alba.isActiveAndEnabled || radarRadius <= 0f)
                {
                    return;
                }

                Vector3 albaPos = alba.transform.position;
                float radiusSqr = radarRadius * radarRadius;
                float invRadius = 1f / radarRadius;

                CollectBlips(_ratPreys, KindRatPrey, albaPos, radiusSqr, invRadius);
                CollectBlips(_mutantCats, KindMutantCat, albaPos, radiusSqr, invRadius);
                CollectBlips(_kingpinBosses, KindKingpinBoss, albaPos, radiusSqr, invRadius);
                CollectBlips(_lieutenantCobaltBosses, KindLieutenantCobaltBoss, albaPos, radiusSqr, invRadius);
            }

            public void ToggleFullMap() => IsFullMapOpen = !IsFullMapOpen;

            public void RefreshTrackedTargets()
            {
                if (alba == null)
                {
                    alba = FindFirstObjectByType<AlbaController>(FindObjectsInactive.Include);
                }

                CacheTargets(_ratPreys);
                CacheTargets(_mutantCats);
                CacheTargets(_kingpinBosses);
                CacheTargets(_lieutenantCobaltBosses);

                int requiredCapacity = _ratPreys.Count + _mutantCats.Count + _kingpinBosses.Count + _lieutenantCobaltBosses.Count;
                if (_blips.Capacity < requiredCapacity)
                {
                    _blips.Capacity = requiredCapacity;
                }
            }

            public void GetRadarBlips(List<RadarBlip> buffer)
            {
                if (buffer == null)
                {
                    return;
                }

                buffer.Clear();
                for (int i = 0; i < _blips.Count; i++)
                {
                    buffer.Add(_blips[i]);
                }
            }

            private static void CacheTargets<T>(List<T> targetList) where T : MonoBehaviour
            {
                targetList.Clear();
                T[] found = FindObjectsByType<T>(FindObjectsInactive.Include, FindObjectsSortMode.None);
                if (targetList.Capacity < found.Length)
                {
                    targetList.Capacity = found.Length;
                }

                for (int i = 0; i < found.Length; i++)
                {
                    targetList.Add(found[i]);
                }
            }

            private void CollectBlips<T>(List<T> targets, string kind, Vector3 albaPos, float radiusSqr, float invRadius)
                where T : MonoBehaviour
            {
                for (int i = 0; i < targets.Count; i++)
                {
                    T target = targets[i];
                    if (target == null)
                    {
                        int lastIndex = targets.Count - 1;
                        targets[i] = targets[lastIndex];
                        targets.RemoveAt(lastIndex);
                        i--;
                        continue;
                    }

                    if (!target.isActiveAndEnabled)
                    {
                        continue;
                    }

                    Vector3 targetPos = target.transform.position;
                    float dx = targetPos.x - albaPos.x;
                    float dz = targetPos.z - albaPos.z;
                    float distSqr = (dx * dx) + (dz * dz);

                    if (distSqr <= radiusSqr)
                    {
                        _blips.Add(new RadarBlip
                        {
                            normalizedOffset = new Vector2(dx * invRadius, dz * invRadius),
                            kind = kind
                        });
                    }
                }
            }
        }
    }
}
