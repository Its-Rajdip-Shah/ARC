"""Focus duration buckets reject a category the planner does not define."""

import pytest

from planning.services.focus_buckets import focus_bucket_key


def test_unknown_duration_is_rejected():
    with pytest.raises(ValueError, match='Unknown duration category'):
        focus_bucket_key('NOT_A_DURATION')
