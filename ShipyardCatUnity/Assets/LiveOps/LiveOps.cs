using System;
using System.Threading.Tasks;
using Unity.Services.RemoteConfig;
using UnityEngine;

// Added by `unity projects create`. Reads the liveops_enabled kill switch from
// Remote Config, which create set to true on the server. Turn it off in the
// Unity Dashboard to switch the live features off without a new build.
public static class LiveOps
{
    public const string EnabledKey = "liveops_enabled";

    struct UserAttributes { }
    struct AppAttributes { }

    // Whether the live features are on. A missing key, a failed sign-in or a
    // failed fetch reads as on, so an outage never turns the game off. Call
    // it in Play mode: the sign-in it waits for starts when a scene loads.
    public static async Task<bool> IsEnabledAsync()
    {
        try
        {
            if (!await PlayerAuthentication.SignedIn)
            {
                return true;
            }
            var config = await RemoteConfigService.Instance.FetchConfigsAsync(
                new UserAttributes(), new AppAttributes());
            return config.GetBool(EnabledKey, true);
        }
        catch (Exception e)
        {
            Debug.LogWarning($"Remote Config fetch failed, live features stay on: {e.Message}");
            return true;
        }
    }
}
