from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            "planning",
            "0013_remove_schedulingpreference_uniq_scheduling_preferences_user_and_more",
        ),
    ]

    operations = [
        migrations.AddField(
            model_name="schedulingstate",
            name="scheduler_flavour",
            field=models.CharField(
                blank=True,
                choices=[
                    ("lock-in", "Lock-in"),
                    ("monk", "Monk"),
                ],
                max_length=16,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="schedulingstate",
            name="scheduler_runtime",
            field=models.JSONField(
                blank=True,
                default=dict,
            ),
        ),
    ]
