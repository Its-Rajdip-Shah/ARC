from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            'planning',
            '0022_assignmentdetail_canvas_weight_percent_and_more',
        ),
    ]

    operations = [
        migrations.AddField(
            model_name='schedulingstate',
            name='pending_scheduling_mode',
            field=models.CharField(
                choices=[
                    ('minimal', 'Minimal'),
                    ('global', 'Global'),
                ],
                default='minimal',
                max_length=16,
            ),
        ),
    ]
