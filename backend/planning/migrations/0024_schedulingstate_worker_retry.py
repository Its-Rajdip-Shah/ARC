from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('planning', '0023_schedulingstate_pending_scheduling_mode')]

    operations = [
        migrations.AddField(
            model_name='schedulingstate', name='scheduler_failure_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='schedulingstate', name='scheduler_retry_after',
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]
