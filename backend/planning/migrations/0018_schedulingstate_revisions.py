from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            'planning',
            '0017_planningitem_manual_requested_order',
        ),
    ]

    operations = [
        migrations.AddField(
            model_name='schedulingstate',
            name='scheduling_revision',
            field=models.PositiveBigIntegerField(
                default=0,
            ),
        ),
        migrations.AddField(
            model_name='schedulingstate',
            name='applied_scheduling_revision',
            field=models.PositiveBigIntegerField(
                default=0,
            ),
        ),
    ]
