from __future__ import annotations

import tweepy

from xauto.config import XCredentials


def make_client(creds: XCredentials) -> tweepy.Client:
    return tweepy.Client(
        consumer_key=creds.api_key,
        consumer_secret=creds.api_secret,
        access_token=creds.access_token,
        access_token_secret=creds.access_token_secret,
    )


def post_tweet(text: str, *, dry_run: bool, creds: XCredentials | None = None) -> str | int:
    """テキストを1件投稿する。dry_run のときは API を呼ばず内容だけ返す。"""
    if dry_run:
        return f"[dry-run] {text}"

    if creds is None:
        creds = XCredentials.from_env()
    client = make_client(creds)
    resp = client.create_tweet(text=text)
    tweet_id = resp.data["id"] if resp and resp.data else None
    if tweet_id is None:
        raise RuntimeError("投稿に成功したが tweet id が取得できませんでした")
    return tweet_id
