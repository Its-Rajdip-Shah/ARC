from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('planning', '0024_schedulingstate_worker_retry')]

    operations = [
        migrations.AddField(
            model_name='schedulingstate',
            name='pending_scheduling_date',
            field=models.DateField(null=True, blank=True),
        ),
    ]
