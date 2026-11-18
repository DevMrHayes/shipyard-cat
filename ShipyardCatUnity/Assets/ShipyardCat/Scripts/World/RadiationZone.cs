using UnityEngine;
using ShipyardCat.Core;
using ShipyardCat.Player;

namespace ShipyardCat.World
{
    public class RadiationZone : MonoBehaviour
    {
        [Header("Zone Classification")]
        public ShipyardZone ZoneType = ShipyardZone.DryDock2_SSNVirginia;
        public bool IsSanctuary = false;
        public bool UpdatePlayerZoneOnEnter = true;

        [Header("Bounds Configuration")]
        public bool UseBoxBounds = false;
        [Min(0.5f)]
        public float Radius = 12f;
        public Vector3 BoxSize = new Vector3(16f, 6f, 16f);
        public Vector3 BoundsOffset = Vector3.zero;

        [Header("Radiation & Recovery Rates (Per Second)")]
        public float RadiationRatePerSecond = 8f;
        public float RadiationClearRatePerSecond = 15f;
        public float HealthRegenPerSecond = 10f;

        private CatVitals _cachedVitals;
        private CatVitals _triggerVitals;
        private bool _wasPlayerInside;
        private float _nextLookupTime;

        private void OnDisable()
        {
            if (_wasPlayerInside)
            {
                CatVitals vitals = ResolvePlayerVitals();
                if (UpdatePlayerZoneOnEnter && vitals != null && vitals.CurrentZone == ZoneType)
                {
                    vitals.SetZone(ShipyardZone.YardGeneral);
                }
            }

            _wasPlayerInside = false;
            _triggerVitals = null;
        }

        private void Update()
        {
            CatVitals vitals = ResolvePlayerVitals();
            if (vitals == null)
            {
                return;
            }

            Vector3 playerPosition = ResolvePlayerPosition(vitals);
            bool isInside = (_triggerVitals == vitals) || IsPositionInside(playerPosition);

            if (isInside && !_wasPlayerInside)
            {
                _wasPlayerInside = true;
                if (UpdatePlayerZoneOnEnter)
                {
                    vitals.SetZone(ZoneType);
                }
            }
            else if (!isInside && _wasPlayerInside)
            {
                _wasPlayerInside = false;
                if (UpdatePlayerZoneOnEnter && vitals.CurrentZone == ZoneType)
                {
                    vitals.SetZone(ShipyardZone.YardGeneral);
                }
            }

            if (isInside && !vitals.IsFainted)
            {
                ApplyZoneEffects(vitals, Time.deltaTime);
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            CatVitals vitals = other.GetComponentInParent<CatVitals>();
            if (vitals != null)
            {
                _triggerVitals = vitals;
            }
        }

        private void OnTriggerExit(Collider other)
        {
            CatVitals vitals = other.GetComponentInParent<CatVitals>();
            if (vitals != null && _triggerVitals == vitals)
            {
                _triggerVitals = null;
            }
        }

        public bool IsPositionInside(Vector3 worldPosition)
        {
            if (UseBoxBounds)
            {
                Vector3 localPos = transform.InverseTransformPoint(worldPosition) - BoundsOffset;
                Vector3 halfExtents = BoxSize * 0.5f;
                return Mathf.Abs(localPos.x) <= halfExtents.x &&
                       Mathf.Abs(localPos.y) <= halfExtents.y &&
                       Mathf.Abs(localPos.z) <= halfExtents.z;
            }

            Vector3 center = transform.TransformPoint(BoundsOffset);
            return (worldPosition - center).sqrMagnitude <= Radius * Radius;
        }

        private void ApplyZoneEffects(CatVitals vitals, float deltaTime)
        {
            if (deltaTime <= 0f)
            {
                return;
            }

            if (IsSanctuary)
            {
                if (RadiationClearRatePerSecond > 0f && vitals.Radiation > 0f)
                {
                    vitals.AddRadiation(-RadiationClearRatePerSecond * deltaTime);
                }

                if (HealthRegenPerSecond > 0f && vitals.Health < vitals.MaxHealth)
                {
                    vitals.ModifyHealth(HealthRegenPerSecond * deltaTime);
                }
            }
            else
            {
                if (!Mathf.Approximately(RadiationRatePerSecond, 0f))
                {
                    vitals.AddRadiation(RadiationRatePerSecond * deltaTime);
                }

                if (!Mathf.Approximately(HealthRegenPerSecond, 0f))
                {
                    vitals.ModifyHealth(HealthRegenPerSecond * deltaTime);
                }
            }
        }

        private CatVitals ResolvePlayerVitals()
        {
            ShipyardGameManager manager = ShipyardGameManager.Instance;
            if (manager != null && manager.PlayerVitals != null)
            {
                _cachedVitals = manager.PlayerVitals;
                return _cachedVitals;
            }

            if (_cachedVitals == null && Time.unscaledTime >= _nextLookupTime)
            {
                _nextLookupTime = Time.unscaledTime + 0.5f;
                _cachedVitals = FindAnyObjectByType<CatVitals>();
            }

            return _cachedVitals;
        }

        private static Vector3 ResolvePlayerPosition(CatVitals vitals)
        {
            ShipyardGameManager manager = ShipyardGameManager.Instance;
            if (manager != null && manager.PlayerTransform != null)
            {
                return manager.PlayerTransform.position;
            }

            return vitals.transform.position;
        }
    }
}
