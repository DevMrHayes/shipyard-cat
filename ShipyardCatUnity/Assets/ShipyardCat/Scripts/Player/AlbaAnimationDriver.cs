using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

namespace ShipyardCat.Player
{
    public class AlbaAnimationDriver : MonoBehaviour
    {
        private const int SlotIdle = 0;
        private const int SlotWalk = 1;
        private const int SlotRun = 2;
        private const int SlotSprint = 3;
        private const int SlotJump = 4;
        private const int SlotAttack = 5;
        private const int SlotCount = 6;

        [Header("Animation Clips")]
        [SerializeField] private AnimationClip idleClip;
        [SerializeField] private AnimationClip walkClip;
        [SerializeField] private AnimationClip runClip;
        [SerializeField] private AnimationClip sprintClip;
        [SerializeField] private AnimationClip jumpClip;
        [SerializeField] private AnimationClip attackClip;

        [Header("References & Blending")]
        [SerializeField] private Transform visualRoot;
        [SerializeField] private float blendSpeed = 10f;
        [SerializeField] private float walkSpeedThreshold = 0.2f;
        [SerializeField] private float runSpeedThreshold = 2.6f;
        [SerializeField] private float sprintSpeedThreshold = 5.4f;
        [SerializeField] private float attackDuration = 0.45f;
        [SerializeField] private float jumpMinDuration = 0.35f;

        private Animator _animator;
        private CharacterController _characterController;
        private AlbaController _albaController;

        private PlayableGraph _graph;
        private AnimationMixerPlayable _mixer;
        private readonly AnimationClipPlayable[] _clipPlayables = new AnimationClipPlayable[SlotCount];
        private readonly AnimationClip[] _clips = new AnimationClip[SlotCount];
        private readonly float[] _weights = new float[SlotCount];

        private bool _graphInitialized;
        private bool _hasAnyClip;

        private float _attackTimer;
        private float _jumpTimer;
        private Vector3 _lastPosition;
        private bool _hasLastPosition;

        private Vector3 _baseVisualScale = Vector3.one;
        private Vector3 _baseVisualLocalPos = Vector3.zero;
        private bool _cachedVisualBase;

        private void Awake()
        {
            ResolveComponents();
            CacheVisualBase();
            SyncClipsArray();
            BuildPlayableGraph();
        }

        private void OnEnable()
        {
            if (_graphInitialized && _graph.IsValid() && !_graph.IsPlaying())
            {
                _graph.Play();
            }

            _lastPosition = transform.position;
            _hasLastPosition = true;
        }

        private void OnDisable()
        {
            if (_graphInitialized && _graph.IsValid() && _graph.IsPlaying())
            {
                _graph.Stop();
            }
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f)
            {
                return;
            }

            UpdateTimers(dt);

            if (!_hasAnyClip)
            {
                UpdateProceduralFallback(dt);
                return;
            }

            if (!_graphInitialized || !_graph.IsValid())
            {
                BuildPlayableGraph();
                if (!_graphInitialized)
                {
                    return;
                }
            }

            EnsureLocomotionLooping();

            float horizontalSpeed = SampleHorizontalSpeed(dt);
            bool isGrounded = SampleGrounded();

            int targetSlot = DetermineTargetSlot(horizontalSpeed, isGrounded);
            UpdateMixerWeights(targetSlot, dt);
        }

        private void OnDestroy()
        {
            DestroyPlayableGraph();
        }

        public void ConfigureClips(
            AnimationClip idle,
            AnimationClip walk,
            AnimationClip run,
            AnimationClip sprint,
            AnimationClip jump,
            AnimationClip attack)
        {
            SetClips(idle, walk, run, sprint, jump, attack);
        }

        public void SetClips(
            AnimationClip idle,
            AnimationClip walk,
            AnimationClip run,
            AnimationClip sprint,
            AnimationClip jump,
            AnimationClip attack)
        {
            idleClip = idle;
            walkClip = walk;
            runClip = run;
            sprintClip = sprint;
            jumpClip = jump;
            attackClip = attack;

            ResolveComponents();
            CacheVisualBase();
            SyncClipsArray();
            BuildPlayableGraph();
        }

        public void TriggerAttack()
        {
            float clipLen = attackClip != null && attackClip.length > 0.05f
                ? Mathf.Min(attackClip.length, attackDuration > 0f ? attackDuration : attackClip.length)
                : attackDuration;

            _attackTimer = Mathf.Max(0.15f, clipLen);
            ResetSlotTime(SlotAttack);
        }

        public void TriggerPounce()
        {
            TriggerJump();
        }

        public void TriggerJump()
        {
            _jumpTimer = Mathf.Max(0.15f, jumpMinDuration);
            ResetSlotTime(SlotJump);
        }

        private void ResolveComponents()
        {
            if (_albaController == null)
            {
                _albaController = GetComponent<AlbaController>() ?? GetComponentInParent<AlbaController>();
            }

            if (_characterController == null)
            {
                _characterController = GetComponent<CharacterController>() ?? GetComponentInParent<CharacterController>();
            }

            if (_animator == null)
            {
                if (visualRoot != null)
                {
                    _animator = visualRoot.GetComponentInChildren<Animator>(true);
                }

                if (_animator == null)
                {
                    _animator = GetComponentInChildren<Animator>(true);
                }

                if (_animator == null)
                {
                    GameObject targetObj = visualRoot != null ? visualRoot.gameObject : gameObject;
                    _animator = targetObj.AddComponent<Animator>();
                }
            }

            if (visualRoot == null && _animator != null && _animator.transform != transform)
            {
                visualRoot = _animator.transform;
            }
        }

        private void CacheVisualBase()
        {
            if (_cachedVisualBase || visualRoot == null)
            {
                return;
            }

            _baseVisualScale = visualRoot.localScale;
            _baseVisualLocalPos = visualRoot.localPosition;
            _cachedVisualBase = true;
        }

        private void SyncClipsArray()
        {
            _clips[SlotIdle] = idleClip;
            _clips[SlotWalk] = walkClip;
            _clips[SlotRun] = runClip;
            _clips[SlotSprint] = sprintClip;
            _clips[SlotJump] = jumpClip;
            _clips[SlotAttack] = attackClip;

            _hasAnyClip = false;
            for (int i = 0; i < SlotCount; i++)
            {
                if (_clips[i] != null)
                {
                    _hasAnyClip = true;
                    break;
                }
            }
        }

        private void BuildPlayableGraph()
        {
            DestroyPlayableGraph();

            if (!_hasAnyClip || _animator == null)
            {
                return;
            }

            _graph = PlayableGraph.Create("AlbaAnimGraph");
            _graph.SetTimeUpdateMode(DirectorUpdateMode.GameTime);

            _mixer = AnimationMixerPlayable.Create(_graph, SlotCount);
            AnimationPlayableOutput output = AnimationPlayableOutput.Create(_graph, "Animation", _animator);
            output.SetSourcePlayable(_mixer);

            int firstValidSlot = -1;
            for (int i = 0; i < SlotCount; i++)
            {
                _weights[i] = 0f;
                if (_clips[i] != null)
                {
                    AnimationClipPlayable clipPlayable = AnimationClipPlayable.Create(_graph, _clips[i]);
                    clipPlayable.SetApplyFootIK(false);
                    _clipPlayables[i] = clipPlayable;
                    _graph.Connect(clipPlayable, 0, _mixer, i);
                    _mixer.SetInputWeight(i, 0f);

                    if (firstValidSlot < 0)
                    {
                        firstValidSlot = i;
                    }
                }
                else
                {
                    _clipPlayables[i] = default;
                    _mixer.SetInputWeight(i, 0f);
                }
            }

            int initialSlot = _clips[SlotIdle] != null ? SlotIdle : firstValidSlot;
            if (initialSlot >= 0)
            {
                _weights[initialSlot] = 1f;
                _mixer.SetInputWeight(initialSlot, 1f);
            }

            _graphInitialized = true;
            if (isActiveAndEnabled)
            {
                _graph.Play();
            }
        }

        private void DestroyPlayableGraph()
        {
            if (_graphInitialized && _graph.IsValid())
            {
                _graph.Destroy();
            }

            _graphInitialized = false;
            for (int i = 0; i < SlotCount; i++)
            {
                _clipPlayables[i] = default;
                _weights[i] = 0f;
            }
        }

        private void UpdateTimers(float dt)
        {
            if (_attackTimer > 0f)
            {
                _attackTimer = Mathf.Max(0f, _attackTimer - dt);
            }

            if (_jumpTimer > 0f)
            {
                _jumpTimer = Mathf.Max(0f, _jumpTimer - dt);
            }
        }

        private float SampleHorizontalSpeed(float dt)
        {
            if (_characterController != null && _characterController.enabled)
            {
                Vector3 vel = _characterController.velocity;
                vel.y = 0f;
                _lastPosition = transform.position;
                _hasLastPosition = true;
                return vel.magnitude;
            }

            if (!_hasLastPosition)
            {
                _lastPosition = transform.position;
                _hasLastPosition = true;
                return 0f;
            }

            Vector3 delta = transform.position - _lastPosition;
            delta.y = 0f;
            _lastPosition = transform.position;
            return delta.magnitude / dt;
        }

        private bool SampleGrounded()
        {
            if (_characterController != null && _characterController.enabled)
            {
                return _characterController.isGrounded;
            }

            return true;
        }

        private int DetermineTargetSlot(float horizontalSpeed, bool isGrounded)
        {
            if (_attackTimer > 0f && _clips[SlotAttack] != null)
            {
                return SlotAttack;
            }

            if ((!isGrounded || _jumpTimer > 0f) && _clips[SlotJump] != null)
            {
                return SlotJump;
            }

            if (horizontalSpeed >= sprintSpeedThreshold)
            {
                return ResolveFallbackSlot(SlotSprint, SlotRun, SlotWalk, SlotIdle);
            }

            if (horizontalSpeed >= runSpeedThreshold)
            {
                return ResolveFallbackSlot(SlotRun, SlotWalk, SlotSprint, SlotIdle);
            }

            if (horizontalSpeed >= walkSpeedThreshold)
            {
                return ResolveFallbackSlot(SlotWalk, SlotRun, SlotIdle, SlotSprint);
            }

            return ResolveFallbackSlot(SlotIdle, SlotWalk, SlotRun, SlotSprint);
        }

        private int ResolveFallbackSlot(int primary, int secondary, int tertiary, int quaternary)
        {
            if (_clips[primary] != null) return primary;
            if (_clips[secondary] != null) return secondary;
            if (_clips[tertiary] != null) return tertiary;
            if (_clips[quaternary] != null) return quaternary;

            for (int i = 0; i < SlotCount; i++)
            {
                if (_clips[i] != null)
                {
                    return i;
                }
            }

            return SlotIdle;
        }

        private void UpdateMixerWeights(int targetSlot, float dt)
        {
            float lerpFactor = 1f - Mathf.Exp(-Mathf.Max(1f, blendSpeed) * dt);
            float totalWeight = 0f;

            for (int i = 0; i < SlotCount; i++)
            {
                if (_clips[i] == null)
                {
                    _weights[i] = 0f;
                    continue;
                }

                float desired = i == targetSlot ? 1f : 0f;
                _weights[i] = Mathf.Lerp(_weights[i], desired, lerpFactor);
                if (_weights[i] < 0.0005f)
                {
                    _weights[i] = 0f;
                }

                totalWeight += _weights[i];
            }

            if (totalWeight > 0.0001f)
            {
                float invTotal = 1f / totalWeight;
                for (int i = 0; i < SlotCount; i++)
                {
                    float normalized = _weights[i] * invTotal;
                    _weights[i] = normalized;
                    _mixer.SetInputWeight(i, normalized);
                }
            }
            else if (_clips[targetSlot] != null)
            {
                _weights[targetSlot] = 1f;
                _mixer.SetInputWeight(targetSlot, 1f);
            }
        }

        private void EnsureLocomotionLooping()
        {
            for (int i = SlotIdle; i <= SlotSprint; i++)
            {
                AnimationClip clip = _clips[i];
                if (clip == null || clip.isLooping || clip.length <= 0.001f)
                {
                    continue;
                }

                AnimationClipPlayable playable = _clipPlayables[i];
                if (!playable.IsValid())
                {
                    continue;
                }

                double time = playable.GetTime();
                if (time >= clip.length)
                {
                    playable.SetTime(time % clip.length);
                }
            }
        }

        private void ResetSlotTime(int slot)
        {
            if (!_graphInitialized || !_graph.IsValid() || slot < 0 || slot >= SlotCount)
            {
                return;
            }

            if (_clips[slot] != null && _clipPlayables[slot].IsValid())
            {
                _clipPlayables[slot].SetTime(0d);
            }
        }

        private void UpdateProceduralFallback(float dt)
        {
            if (visualRoot == null)
            {
                return;
            }

            CacheVisualBase();

            float speed = SampleHorizontalSpeed(dt);
            float t = Time.time;

            if (speed > walkSpeedThreshold)
            {
                float strideFreq = Mathf.Lerp(7f, 13f, Mathf.InverseLerp(walkSpeedThreshold, sprintSpeedThreshold, speed));
                float bob = Mathf.Abs(Mathf.Sin(t * strideFreq)) * 0.04f;
                visualRoot.localPosition = _baseVisualLocalPos + new Vector3(0f, bob, 0f);
                visualRoot.localScale = _baseVisualScale;
            }
            else
            {
                float breathe = Mathf.Sin(t * 2.4f);
                Vector3 scaleOffset = new Vector3(breathe * -0.015f, breathe * 0.025f, breathe * -0.01f);
                visualRoot.localScale = _baseVisualScale + Vector3.Scale(_baseVisualScale, scaleOffset);
                visualRoot.localPosition = _baseVisualLocalPos + new Vector3(0f, Mathf.Max(0f, breathe) * 0.01f, 0f);
            }
        }
    }
}
