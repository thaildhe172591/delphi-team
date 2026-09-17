"""Mark the wheel as platform-specific so it can carry a compiled binary.

The wheel holds no Python C extension, so the ABI tag stays ``none``; only the platform
tag changes. ``DELPHI_WHEEL_TAG`` is set by CI per target; building locally without it
infers the tag from the host.
"""

import os

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        build_data["pure_python"] = False
        tag = os.environ.get("DELPHI_WHEEL_TAG")
        if tag:
            build_data["tag"] = tag
        else:
            build_data["infer_tag"] = True
