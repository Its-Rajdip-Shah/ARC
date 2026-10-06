from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            'planning',
            '0018_schedulingstate_revisions',
        ),
    ]

    operations = [
        migrations.AddField(
            model_name='schedulingstate',
            name='study_plan',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='schedulingstate',
            name='study_preferences',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
