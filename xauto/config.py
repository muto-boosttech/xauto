from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class XCredentials:
    api_key: str
    api_secret: str
    access_token: str
    access_token_secret: str

    @classmethod
    def from_env(cls) -> XCredentials:
        keys = (
            "X_API_KEY",
            "X_API_SECRET",
            "X_ACCESS_TOKEN",
            "X_ACCESS_TOKEN_SECRET",
        )
        values = {k: os.environ.get(k, "").strip() for k in keys}
        missing = [k for k, v in values.items() if not v]
        if missing:
            raise ValueError(
                "環境変数が未設定です: "
                + ", ".join(missing)
                + "（.env.example を参照）"
            )
        return cls(
            api_key=values["X_API_KEY"],
            api_secret=values["X_API_SECRET"],
            access_token=values["X_ACCESS_TOKEN"],
            access_token_secret=values["X_ACCESS_TOKEN_SECRET"],
        )
