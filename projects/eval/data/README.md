# locomo data

`locomo10.json` is downloaded from the [LoCoMo](https://github.com/snap-research/LoCoMo) dataset
(`data/locomo10.json` in that repo) and gitignored here rather than committed, since it's a
~2.8MB third-party artifact, not something this project should carry in its own history.

To fetch it:

```sh
curl -sL -o data/locomo10.json https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json
```
