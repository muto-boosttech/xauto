from __future__ import annotations

import argparse
import sys

from xauto.client import post_tweet
from xauto.config import XCredentials


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="X 自動運用 — テキスト投稿（既定はドライラン）")
    sub = parser.add_subparsers(dest="command", required=True)

    p_post = sub.add_parser("post", help="ツイート本文を投稿")
    p_post.add_argument("text", help="投稿するテキスト")
    p_post.add_argument(
        "--execute",
        action="store_true",
        help="実際に API で投稿する（省略時はドライラン）",
    )

    args = parser.parse_args(argv)

    if args.command == "post":
        try:
            creds = None if not args.execute else XCredentials.from_env()
        except ValueError as e:
            print(e, file=sys.stderr)
            return 1
        result = post_tweet(args.text, dry_run=not args.execute, creds=creds)
        print(result)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
