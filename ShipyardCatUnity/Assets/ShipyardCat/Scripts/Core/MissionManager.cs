using System;
using System.Collections.Generic;
using UnityEngine;

namespace ShipyardCat.Core
{
    [Serializable]
    public class MissionObjective
    {
        public string id;
        public string title;
        public int act;
        public int chapter;
        public bool completed;
    }

    [DisallowMultipleComponent]
    public sealed class MissionManager : MonoBehaviour
    {
        public static MissionManager Instance { get; private set; }

        [SerializeField]
        private List<MissionObjective> objectives = new List<MissionObjective>();

        public event Action<MissionObjective> OnObjectiveCompleted;

        public IReadOnlyList<MissionObjective> Objectives => objectives;

        public int CompletedCount
        {
            get
            {
                int count = 0;
                for (int i = 0; i < objectives.Count; i++)
                {
                    if (objectives[i].completed)
                    {
                        count++;
                    }
                }
                return count;
            }
        }

        public int TotalCount => objectives.Count;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            if (objectives == null || objectives.Count == 0)
            {
                PopulateDefaultMissions();
            }
        }

        private void Reset()
        {
            PopulateDefaultMissions();
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
        }

        public void CompleteObjective(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                Debug.LogWarning($"[{nameof(MissionManager)}] Cannot complete objective with null or empty id.", this);
                return;
            }

            for (int i = 0; i < objectives.Count; i++)
            {
                MissionObjective objective = objectives[i];
                if (string.Equals(objective.id, id, StringComparison.Ordinal))
                {
                    if (objective.completed)
                    {
                        return;
                    }

                    objective.completed = true;
                    OnObjectiveCompleted?.Invoke(objective);
                    return;
                }
            }

            Debug.LogWarning($"[{nameof(MissionManager)}] Objective with id '{id}' was not found.", this);
        }

        public MissionObjective GetActiveObjective()
        {
            MissionObjective active = null;

            for (int i = 0; i < objectives.Count; i++)
            {
                MissionObjective candidate = objectives[i];
                if (candidate.completed)
                {
                    continue;
                }

                if (active == null ||
                    candidate.act < active.act ||
                    (candidate.act == active.act && candidate.chapter < active.chapter))
                {
                    active = candidate;
                }
            }

            return active;
        }

        public MissionObjective GetObjectiveById(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return null;
            }

            for (int i = 0; i < objectives.Count; i++)
            {
                if (string.Equals(objectives[i].id, id, StringComparison.Ordinal))
                {
                    return objectives[i];
                }
            }

            return null;
        }

        public void ResetAllProgress()
        {
            for (int i = 0; i < objectives.Count; i++)
            {
                objectives[i].completed = false;
            }
        }

        private void PopulateDefaultMissions()
        {
            objectives = new List<MissionObjective>
            {
                // Act 1
                new MissionObjective
                {
                    id = "act1_ch1_gate4_patrol",
                    title = "Gate 4 Patrol: Secure the Shipyard Perimeter",
                    act = 1,
                    chapter = 1,
                    completed = false
                },
                new MissionObjective
                {
                    id = "act1_ch2_dd1_kingpin",
                    title = "Dry Dock 1 Kingpin: Confront the Dockyard Boss",
                    act = 1,
                    chapter = 2,
                    completed = false
                },

                // Act 2
                new MissionObjective
                {
                    id = "act2_ch3_cat_motel",
                    title = "Cat Motel Sanctuary: Establish Safe Haven for Strays",
                    act = 2,
                    chapter = 3,
                    completed = false
                },
                new MissionObjective
                {
                    id = "act2_ch4_jmaf_blueprints",
                    title = "JMAF Blueprints: Recover Classified Hull Schematics",
                    act = 2,
                    chapter = 4,
                    completed = false
                },

                // Act 3
                new MissionObjective
                {
                    id = "act3_ch5_apprentice_school",
                    title = "Apprentice School Collectibles: Gather Lost Training Manuals",
                    act = 3,
                    chapter = 5,
                    completed = false
                },
                new MissionObjective
                {
                    id = "act3_ch6_dd2_submarine",
                    title = "DD2 Submarine: Infiltrate the Refit Submersible",
                    act = 3,
                    chapter = 6,
                    completed = false
                },

                // Act 4
                new MissionObjective
                {
                    id = "act4_ch7_dd12_cvn80",
                    title = "DD12 CVN-80: Sabotage Operations on the Supercarrier",
                    act = 4,
                    chapter = 7,
                    completed = false
                },
                new MissionObjective
                {
                    id = "act4_ch8_lt_cobalt",
                    title = "Lt. Cobalt: Final Showdown at the Command Pier",
                    act = 4,
                    chapter = 8,
                    completed = false
                }
            };
        }
    }
}
