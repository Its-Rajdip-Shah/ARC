from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('canvas_integration', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='canvasconnection',
            name='sync_course_ids',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
