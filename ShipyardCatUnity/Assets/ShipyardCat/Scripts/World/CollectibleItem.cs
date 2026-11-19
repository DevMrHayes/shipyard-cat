using System;
using UnityEngine;
using ShipyardCat.Core;
using ShipyardCat.Player;

namespace ShipyardCat.World
{
    public class CollectibleItem : MonoBehaviour
    {
        private const float BobAmplitude = 0.15f;
        private const float BobFrequency = 2.0f;
        private const float RotateSpeed = 45.0f;

        [SerializeField] private string itemId = "jmaf_blueprints";
        [SerializeField] private string displayName = "JMAF Reactor Blueprints";
        [SerializeField] private string missionObjectiveId = "";
        [SerializeField] private int xpReward = 150;
        [SerializeField] private float healthRestore = 25f;
        [SerializeField] private float pickupRadius = 2.0f;

        private Vector3 _startPosition;
        private bool _hasStartPosition;
        private AlbaController _cachedAlba;

        public bool IsCollected { get; private set; }
        public string ItemId => itemId;
        public string DisplayName => displayName;

        public static event Action<CollectibleItem> OnItemCollected;

        public void Configure(string id, string label, string objectiveId, int xp, float heal)
        {
            itemId = id;
            displayName = label;
            missionObjectiveId = objectiveId;
            xpReward = xp;
            healthRestore = heal;
        }

        private void Start()
        {
            _startPosition = transform.position;
            _hasStartPosition = true;
        }

        private void Update()
        {
            if (IsCollected)
            {
                return;
            }

            if (!_hasStartPosition)
            {
                _startPosition = transform.position;
                _hasStartPosition = true;
            }

            transform.Rotate(Vector3.up, RotateSpeed * Time.deltaTime, Space.World);

            Vector3 position = _startPosition;
            position.y += Mathf.Sin(Time.time * BobFrequency) * BobAmplitude;
            transform.position = position;

            if (_cachedAlba == null)
            {
                _cachedAlba = FindAnyObjectByType<AlbaController>();
            }

            if (_cachedAlba != null)
            {
                float sqrDistance = (_cachedAlba.transform.position - transform.position).sqrMagnitude;
                if (sqrDistance <= pickupRadius * pickupRadius)
                {
                    CatVitals vitals = _cachedAlba.GetComponent<CatVitals>();
                    if (vitals == null)
                    {
                        vitals = _cachedAlba.GetComponentInChildren<CatVitals>();
                    }

                    TryCollect(vitals);
                }
            }
        }

        public bool TryCollect(CatVitals vitals)
        {
            if (IsCollected)
            {
                return false;
            }

            IsCollected = true;

            if (vitals != null)
            {
                vitals.ModifyHealth(healthRestore);
            }

            ProgressionSystem.Instance?.AddXP(xpReward);

            if (!string.IsNullOrEmpty(missionObjectiveId))
            {
                MissionManager.Instance?.CompleteObjective(missionObjectiveId);
            }

            OnItemCollected?.Invoke(this);
            gameObject.SetActive(false);

            return true;
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.cyan;
            Gizmos.DrawWireSphere(transform.position, pickupRadius);
        }
    }
}
