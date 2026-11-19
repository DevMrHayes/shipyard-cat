using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;

namespace ShipyardCat.Core
{
    [DisallowMultipleComponent]
    public class ShipyardProgressBridge : MonoBehaviour
    {
        [Header("Scan Settings")]
        [SerializeField, Min(0.1f)] private float scanInterval = 0.5f;

        [Header("XP Rewards")]
        [SerializeField] private int ratXP = 50;
        [SerializeField] private int mutantXP = 120;
        [SerializeField] private int bossXP = 400;

        [Header("Mission Milestones")]
        [SerializeField, Min(1)] private int dryDockRatThreshold = 5;
        [SerializeField] private string dryDockObjectiveId = "Dry Dock 1";
        [SerializeField] private string bossObjectiveId = "Boss";

        public int ActiveVerminCount { get; private set; }
        public int DefeatedVerminCount { get; private set; }

        public event Action<int, int> OnVerminCountsChanged;

        private enum EnemyCategory
        {
            Rat,
            Mutant,
            Boss
        }

        private sealed class EnemyTypeAdapter
        {
            public readonly Type Type;
            public readonly EnemyCategory Category;
            public readonly int XPReward;

            private readonly PropertyInfo _isDeadProp;
            private readonly FieldInfo _isDeadField;
            private readonly MethodInfo _isDeadMethod;
            private readonly PropertyInfo _healthProp;
            private readonly FieldInfo _healthField;
            private readonly MethodInfo _healthMethod;

            public EnemyTypeAdapter(Type type, EnemyCategory category, int xpReward)
            {
                Type = type;
                Category = category;
                XPReward = xpReward;

                if (type == null)
                {
                    return;
                }

                const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

                _isDeadProp = FindBoolProperty(type, flags, "IsDead", "isDead", "Dead", "dead", "IsDefeated", "isDefeated");
                _isDeadField = _isDeadProp == null
                    ? FindBoolField(type, flags, "IsDead", "isDead", "Dead", "dead", "IsDefeated", "isDefeated")
                    : null;
                _isDeadMethod = (_isDeadProp == null && _isDeadField == null)
                    ? FindBoolMethod(type, flags, "IsDead", "GetIsDead", "IsDefeated")
                    : null;

                _healthProp = FindNumericProperty(type, flags, "Health", "health", "CurrentHealth", "currentHealth", "HP", "hp");
                _healthField = _healthProp == null
                    ? FindNumericField(type, flags, "Health", "health", "CurrentHealth", "currentHealth", "HP", "hp")
                    : null;
                _healthMethod = (_healthProp == null && _healthField == null)
                    ? FindNumericMethod(type, flags, "GetHealth", "GetCurrentHealth")
                    : null;
            }

            public bool EvaluateIsDefeated(object instance)
            {
                if (instance == null)
                {
                    return false;
                }

                if (_isDeadProp != null && (bool)_isDeadProp.GetValue(instance))
                {
                    return true;
                }

                if (_isDeadField != null && (bool)_isDeadField.GetValue(instance))
                {
                    return true;
                }

                if (_isDeadMethod != null && (bool)_isDeadMethod.Invoke(instance, EmptyArgs))
                {
                    return true;
                }

                if (_healthProp != null)
                {
                    return Convert.ToSingle(_healthProp.GetValue(instance)) <= 0f;
                }

                if (_healthField != null)
                {
                    return Convert.ToSingle(_healthField.GetValue(instance)) <= 0f;
                }

                if (_healthMethod != null)
                {
                    return Convert.ToSingle(_healthMethod.Invoke(instance, EmptyArgs)) <= 0f;
                }

                return false;
            }
        }

        private struct TrackedEnemy
        {
            public UnityEngine.Object ObjectRef;
            public Component ComponentRef;
            public EnemyTypeAdapter Adapter;
            public bool IsDefeated;
        }

        private static readonly object[] EmptyArgs = Array.Empty<object>();

        private readonly object[] _oneArgBuffer = new object[1];
        private readonly object[] _twoArgBuffer = new object[2];

        private readonly Dictionary<int, TrackedEnemy> _trackedById = new Dictionary<int, TrackedEnemy>(64);
        private readonly List<int> _trackedIds = new List<int>(64);
        private readonly HashSet<int> _defeatedIds = new HashSet<int>();

        private EnemyTypeAdapter[] _enemyAdapters;
        private float _scanTimer;

        private int _defeatedRatCount;
        private int _defeatedBossCount;
        private bool _ratMilestoneReached;
        private bool _bossMilestoneReached;

        // Cached external system reflection handles
        private Type _progressionType;
        private MemberInfo _progressionInstanceMember;
        private MethodInfo _addXPMethod;
        private int _addXPParamCount;
        private Type _addXPFirstParamType;

        private Type _catVitalsType;
        private MemberInfo _catVitalsInstanceMember;
        private UnityEngine.Object _cachedCatVitals;
        private MethodInfo _registerRatCaughtMethod;
        private int _registerRatParamCount;
        private Type _registerRatFirstParamType;

        private Type _missionManagerType;
        private MemberInfo _missionInstanceMember;
        private UnityEngine.Object _cachedMissionManager;
        private MethodInfo _missionCompleteByNameMethod;
        private MethodInfo _missionAdvanceMethod;
        private MethodInfo _missionBossMethod;
        private MemberInfo _missionTitleMember;
        private MethodInfo _missionTitleMethod;
        private MemberInfo _missionTotalTargetsMember;

        private void Awake()
        {
            InitializeEnemyAdapters();
            InitializeExternalSystemReflection();
        }

        private void Start()
        {
            ScanVermin(isInitialScan: true);
        }

        private void Update()
        {
            _scanTimer += Time.deltaTime;
            if (_scanTimer < scanInterval)
            {
                return;
            }

            _scanTimer = _scanTimer >= scanInterval * 2f ? 0f : _scanTimer - scanInterval;
            ScanVermin(isInitialScan: false);
        }

        public string BuildObjectiveBannerText()
        {
            string title = ResolveActiveObjectiveTitle();
            int totalTargets = ResolveTotalTargets();
            return $"\u25c6 {title} [{DefeatedVerminCount}/{totalTargets} Cleared]";
        }

        private void ScanVermin(bool isInitialScan)
        {
            if (_enemyAdapters != null)
            {
                for (int i = 0; i < _enemyAdapters.Length; i++)
                {
                    EnemyTypeAdapter adapter = _enemyAdapters[i];
                    if (adapter.Type == null)
                    {
                        continue;
                    }

                    UnityEngine.Object[] found = FindObjectsByType(
                        adapter.Type,
                        FindObjectsInactive.Exclude,
                        FindObjectsSortMode.None);

                    for (int j = 0; j < found.Length; j++)
                    {
                        UnityEngine.Object obj = found[j];
                        if (obj == null)
                        {
                            continue;
                        }

                        int instanceId = System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(obj);
                        if (_trackedById.ContainsKey(instanceId) || _defeatedIds.Contains(instanceId))
                        {
                            continue;
                        }

                        bool alreadyDead = adapter.EvaluateIsDefeated(obj);
                        var tracked = new TrackedEnemy
                        {
                            ObjectRef = obj,
                            ComponentRef = obj as Component,
                            Adapter = adapter,
                            IsDefeated = isInitialScan && alreadyDead
                        };

                        if (tracked.IsDefeated)
                        {
                            _defeatedIds.Add(instanceId);
                            RecordCategoryCount(adapter.Category);
                            continue;
                        }

                        _trackedById.Add(instanceId, tracked);
                        _trackedIds.Add(instanceId);

                        if (alreadyDead && !isInitialScan)
                        {
                            HandleEnemyDefeated(instanceId, ref tracked);
                        }
                    }
                }
            }

            int activeCount = 0;

            for (int i = _trackedIds.Count - 1; i >= 0; i--)
            {
                int id = _trackedIds[i];
                TrackedEnemy entry = _trackedById[id];

                if (entry.ObjectRef == null)
                {
                    _trackedById.Remove(id);
                    _trackedIds.RemoveAt(i);
                    continue;
                }

                if (!entry.IsDefeated && entry.Adapter.EvaluateIsDefeated(entry.ObjectRef))
                {
                    HandleEnemyDefeated(id, ref entry);
                    _trackedById[id] = entry;
                }

                if (entry.IsDefeated)
                {
                    _trackedById.Remove(id);
                    _trackedIds.RemoveAt(i);
                    continue;
                }

                if (entry.ComponentRef == null || entry.ComponentRef.gameObject.activeInHierarchy)
                {
                    activeCount++;
                }
            }

            int defeatedCount = _defeatedIds.Count;
            if (activeCount != ActiveVerminCount || defeatedCount != DefeatedVerminCount)
            {
                ActiveVerminCount = activeCount;
                DefeatedVerminCount = defeatedCount;
                OnVerminCountsChanged?.Invoke(ActiveVerminCount, DefeatedVerminCount);
            }
        }

        private void HandleEnemyDefeated(int instanceId, ref TrackedEnemy entry)
        {
            if (!_defeatedIds.Add(instanceId))
            {
                entry.IsDefeated = true;
                return;
            }

            entry.IsDefeated = true;

            AwardXP(entry.Adapter.XPReward);
            IncrementRatCaught();
            RecordCategoryCount(entry.Adapter.Category);
            EvaluateMissionMilestones();
        }

        private void RecordCategoryCount(EnemyCategory category)
        {
            if (category == EnemyCategory.Rat)
            {
                _defeatedRatCount++;
            }
            else if (category == EnemyCategory.Boss)
            {
                _defeatedBossCount++;
            }
        }

        private void EvaluateMissionMilestones()
        {
            if (!_ratMilestoneReached && _defeatedRatCount >= dryDockRatThreshold)
            {
                _ratMilestoneReached = true;
                AdvanceMissionForMilestone(dryDockObjectiveId, isBossMilestone: false);
            }

            if (!_bossMilestoneReached && _defeatedBossCount >= 1)
            {
                _bossMilestoneReached = true;
                AdvanceMissionForMilestone(bossObjectiveId, isBossMilestone: true);
            }
        }

        private void AwardXP(int amount)
        {
            if (amount <= 0 || _progressionType == null || _addXPMethod == null)
            {
                return;
            }

            object instance = ResolveSingleton(_progressionType, _progressionInstanceMember);
            if (instance == null && !_addXPMethod.IsStatic)
            {
                return;
            }

            object convertedAmount = _addXPFirstParamType == typeof(float) ? (object)(float)amount : amount;

            if (_addXPParamCount == 1)
            {
                _oneArgBuffer[0] = convertedAmount;
                _addXPMethod.Invoke(instance, _oneArgBuffer);
            }
            else if (_addXPParamCount == 2)
            {
                _twoArgBuffer[0] = convertedAmount;
                _twoArgBuffer[1] = "VerminDefeat";
                _addXPMethod.Invoke(instance, _twoArgBuffer);
            }
        }

        private void IncrementRatCaught()
        {
            if (_catVitalsType == null || _registerRatCaughtMethod == null)
            {
                return;
            }

            object target = null;
            if (!_registerRatCaughtMethod.IsStatic)
            {
                target = ResolveCachedComponent(_catVitalsType, _catVitalsInstanceMember, ref _cachedCatVitals);
                if (target == null)
                {
                    return;
                }
            }

            if (_registerRatParamCount == 0)
            {
                _registerRatCaughtMethod.Invoke(target, EmptyArgs);
            }
            else if (_registerRatParamCount == 1)
            {
                _oneArgBuffer[0] = _registerRatFirstParamType == typeof(float) ? (object)1f : 1;
                _registerRatCaughtMethod.Invoke(target, _oneArgBuffer);
            }
        }

        private void AdvanceMissionForMilestone(string objectiveId, bool isBossMilestone)
        {
            if (_missionManagerType == null)
            {
                return;
            }

            object manager = ResolveCachedComponent(_missionManagerType, _missionInstanceMember, ref _cachedMissionManager);
            if (manager == null)
            {
                return;
            }

            if (isBossMilestone && _missionBossMethod != null)
            {
                _missionBossMethod.Invoke(manager, EmptyArgs);
                return;
            }

            if (_missionCompleteByNameMethod != null)
            {
                _oneArgBuffer[0] = objectiveId;
                _missionCompleteByNameMethod.Invoke(manager, _oneArgBuffer);
                return;
            }

            if (_missionAdvanceMethod != null)
            {
                _missionAdvanceMethod.Invoke(manager, EmptyArgs);
            }
        }

        private string ResolveActiveObjectiveTitle()
        {
            if (_missionManagerType != null)
            {
                object manager = ResolveCachedComponent(_missionManagerType, _missionInstanceMember, ref _cachedMissionManager);
                if (manager != null)
                {
                    if (_missionTitleMethod != null)
                    {
                        object value = _missionTitleMethod.Invoke(manager, EmptyArgs);
                        string title = ExtractTitle(value);
                        if (!string.IsNullOrEmpty(title))
                        {
                            return title;
                        }
                    }

                    if (_missionTitleMember != null)
                    {
                        object value = GetMemberValue(_missionTitleMember, manager);
                        string title = ExtractTitle(value);
                        if (!string.IsNullOrEmpty(title))
                        {
                            return title;
                        }
                    }
                }
            }

            if (!_ratMilestoneReached)
            {
                return $"Clear {dryDockObjectiveId}";
            }

            if (!_bossMilestoneReached)
            {
                return "Defeat the Syndicate Boss";
            }

            return "Shipyard Secured";
        }

        private int ResolveTotalTargets()
        {
            if (_missionManagerType != null && _missionTotalTargetsMember != null)
            {
                object manager = ResolveCachedComponent(_missionManagerType, _missionInstanceMember, ref _cachedMissionManager);
                if (manager != null)
                {
                    object value = GetMemberValue(_missionTotalTargetsMember, manager);
                    if (value != null)
                    {
                        int missionTarget = Convert.ToInt32(value);
                        if (missionTarget > 0)
                        {
                            return Mathf.Max(missionTarget, DefeatedVerminCount);
                        }
                    }
                }
            }

            return Mathf.Max(ActiveVerminCount + DefeatedVerminCount, DefeatedVerminCount);
        }

        private void InitializeEnemyAdapters()
        {
            _enemyAdapters = new[]
            {
                new EnemyTypeAdapter(FindTypeByName("RatPreyAI"), EnemyCategory.Rat, ratXP),
                new EnemyTypeAdapter(FindTypeByName("MutantCatAI"), EnemyCategory.Mutant, mutantXP),
                new EnemyTypeAdapter(FindTypeByName("KingpinBossAI"), EnemyCategory.Boss, bossXP),
                new EnemyTypeAdapter(FindTypeByName("LieutenantCobaltBossAI"), EnemyCategory.Boss, bossXP)
            };
        }

        private void InitializeExternalSystemReflection()
        {
            const BindingFlags anyFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;
            const BindingFlags staticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
            const BindingFlags instanceFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

            _progressionType = FindTypeByName("ProgressionSystem");
            if (_progressionType != null)
            {
                _progressionInstanceMember = FindMember(_progressionType, staticFlags, "Instance", "instance", "Current");
                MethodInfo[] methods = _progressionType.GetMethods(anyFlags);
                for (int i = 0; i < methods.Length; i++)
                {
                    MethodInfo m = methods[i];
                    if (m.Name != "AddXP")
                    {
                        continue;
                    }

                    ParameterInfo[] p = m.GetParameters();
                    if (p.Length == 1 && IsNumericType(p[0].ParameterType))
                    {
                        _addXPMethod = m;
                        _addXPParamCount = 1;
                        _addXPFirstParamType = p[0].ParameterType;
                        break;
                    }

                    if (p.Length == 2 && IsNumericType(p[0].ParameterType) && p[1].ParameterType == typeof(string) && _addXPMethod == null)
                    {
                        _addXPMethod = m;
                        _addXPParamCount = 2;
                        _addXPFirstParamType = p[0].ParameterType;
                    }
                }
            }

            _catVitalsType = FindTypeByName("CatVitals");
            if (_catVitalsType != null)
            {
                _catVitalsInstanceMember = FindMember(_catVitalsType, staticFlags, "Instance", "instance", "Current");
                MethodInfo[] methods = _catVitalsType.GetMethods(anyFlags);
                for (int i = 0; i < methods.Length; i++)
                {
                    MethodInfo m = methods[i];
                    if (m.Name != "RegisterRatCaught")
                    {
                        continue;
                    }

                    ParameterInfo[] p = m.GetParameters();
                    if (p.Length == 0)
                    {
                        _registerRatCaughtMethod = m;
                        _registerRatParamCount = 0;
                        break;
                    }

                    if (p.Length == 1 && IsNumericType(p[0].ParameterType) && _registerRatCaughtMethod == null)
                    {
                        _registerRatCaughtMethod = m;
                        _registerRatParamCount = 1;
                        _registerRatFirstParamType = p[0].ParameterType;
                    }
                }
            }

            _missionManagerType = FindTypeByName("MissionManager");
            if (_missionManagerType != null)
            {
                _missionInstanceMember = FindMember(_missionManagerType, staticFlags, "Instance", "instance", "Current");
                _missionBossMethod = FindZeroArgMethod(_missionManagerType, instanceFlags,
                    "CompleteBossObjective", "OnBossDefeated", "TriggerBossObjective");
                _missionCompleteByNameMethod = FindSingleStringMethod(_missionManagerType, instanceFlags,
                    "CompleteObjective", "AdvanceToObjective", "SetObjective", "ActivateObjective", "UnlockObjective");
                _missionAdvanceMethod = FindZeroArgMethod(_missionManagerType, instanceFlags,
                    "AdvanceObjective", "AdvanceMission", "CompleteCurrentObjective", "NextObjective");
                _missionTitleMethod = FindZeroArgMethod(_missionManagerType, instanceFlags,
                    "GetActiveObjectiveTitle", "GetCurrentObjectiveTitle");
                _missionTitleMember = FindMember(_missionManagerType, instanceFlags,
                    "ActiveObjectiveTitle", "CurrentObjectiveTitle", "ActiveObjective", "CurrentObjective", "ObjectiveTitle");
                _missionTotalTargetsMember = FindMember(_missionManagerType, instanceFlags,
                    "ActiveObjectiveTargetCount", "CurrentTargetCount", "TotalTargets", "TargetCount", "RequiredCount");
            }
        }

        private static object ResolveSingleton(Type type, MemberInfo instanceMember)
        {
            if (instanceMember == null)
            {
                return null;
            }

            object val = GetMemberValue(instanceMember, null);
            if (val is UnityEngine.Object unityObj && unityObj == null)
            {
                return null;
            }

            return val;
        }

        private static object ResolveCachedComponent(Type type, MemberInfo instanceMember, ref UnityEngine.Object cached)
        {
            object singleton = ResolveSingleton(type, instanceMember);
            if (singleton != null)
            {
                return singleton;
            }

            if (cached == null)
            {
                cached = FindFirstObjectByType(type);
            }

            return cached;
        }

        private static string ExtractTitle(object value)
        {
            if (value == null)
            {
                return null;
            }

            if (value is string str)
            {
                return str;
            }

            Type valueType = value.GetType();
            const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
            MemberInfo titleMember = FindMember(valueType, flags, "Title", "title", "DisplayName", "displayName", "Name", "name");
            if (titleMember != null)
            {
                return GetMemberValue(titleMember, value) as string;
            }

            return value.ToString();
        }

        private static Type FindTypeByName(string typeName)
        {
            Assembly[] assemblies = AppDomain.CurrentDomain.GetAssemblies();
            for (int i = 0; i < assemblies.Length; i++)
            {
                Type[] types;
                try
                {
                    types = assemblies[i].GetTypes();
                }
                catch (ReflectionTypeLoadException ex)
                {
                    types = ex.Types;
                }

                if (types == null)
                {
                    continue;
                }

                for (int j = 0; j < types.Length; j++)
                {
                    Type t = types[j];
                    if (t != null && t.Name == typeName)
                    {
                        return t;
                    }
                }
            }

            return null;
        }

        private static MemberInfo FindMember(Type type, BindingFlags flags, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                PropertyInfo prop = type.GetProperty(names[i], flags);
                if (prop != null && prop.CanRead)
                {
                    return prop;
                }

                FieldInfo field = type.GetField(names[i], flags);
                if (field != null)
                {
                    return field;
                }
            }

            return null;
        }

        private static object GetMemberValue(MemberInfo member, object target)
        {
            if (member is PropertyInfo prop)
            {
                return prop.GetValue(target);
            }

            if (member is FieldInfo field)
            {
                return field.GetValue(target);
            }

            return null;
        }

        private static MethodInfo FindZeroArgMethod(Type type, BindingFlags flags, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                MethodInfo m = type.GetMethod(names[i], flags, null, Type.EmptyTypes, null);
                if (m != null)
                {
                    return m;
                }
            }

            return null;
        }

        private static MethodInfo FindSingleStringMethod(Type type, BindingFlags flags, params string[] names)
        {
            Type[] stringParam = { typeof(string) };
            for (int i = 0; i < names.Length; i++)
            {
                MethodInfo m = type.GetMethod(names[i], flags, null, stringParam, null);
                if (m != null)
                {
                    return m;
                }
            }

            return null;
        }

        private static PropertyInfo FindBoolProperty(Type type, BindingFlags flags, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                PropertyInfo p = type.GetProperty(names[i], flags);
                if (p != null && p.CanRead && p.PropertyType == typeof(bool))
                {
                    return p;
                }
            }

            return null;
        }

        private static FieldInfo FindBoolField(Type type, BindingFlags flags, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                FieldInfo f = type.GetField(names[i], flags);
                if (f != null && f.FieldType == typeof(bool))
                {
                    return f;
                }
            }

            return null;
        }

        private static MethodInfo FindBoolMethod(Type type, BindingFlags flags, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                MethodInfo m = type.GetMethod(names[i], flags, null, Type.EmptyTypes, null);
                if (m != null && m.ReturnType == typeof(bool))
                {
                    return m;
                }
            }

            return null;
        }

        private static PropertyInfo FindNumericProperty(Type type, BindingFlags flags, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                PropertyInfo p = type.GetProperty(names[i], flags);
                if (p != null && p.CanRead && IsNumericType(p.PropertyType))
                {
                    return p;
                }
            }

            return null;
        }

        private static FieldInfo FindNumericField(Type type, BindingFlags flags, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                FieldInfo f = type.GetField(names[i], flags);
                if (f != null && IsNumericType(f.FieldType))
                {
                    return f;
                }
            }

            return null;
        }

        private static MethodInfo FindNumericMethod(Type type, BindingFlags flags, params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                MethodInfo m = type.GetMethod(names[i], flags, null, Type.EmptyTypes, null);
                if (m != null && IsNumericType(m.ReturnType))
                {
                    return m;
                }
            }

            return null;
        }

        private static bool IsNumericType(Type t)
        {
            return t == typeof(int) || t == typeof(float) || t == typeof(double);
        }
    }
}
