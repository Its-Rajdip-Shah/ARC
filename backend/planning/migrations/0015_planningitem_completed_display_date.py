from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            'planning',
            '0014_schedulingstate_scheduler_flavour',
        ),
    ]

    operations = [
        migrations.AddField(
            model_name='planningitem',
            name='completed_display_date',
            field=models.DateField(
                blank=True,
                null=True,
            ),
        ),
    ]
