"""Merge the independent authentication and timezone migrations."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_loginattempt"),
        ("accounts", "0002_user_time_zone"),
    ]

    operations = []
