from django.core.management import call_command
from django.db import migrations


def create_arc_cache(apps, schema_editor):
    call_command(
        'createcachetable',
        'arc_cache',
        database=schema_editor.connection.alias,
        verbosity=0,
    )


def drop_arc_cache(apps, schema_editor):
    schema_editor.execute('DROP TABLE IF EXISTS arc_cache')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_passwordresetrequest_purpose'),
    ]

    operations = [
        migrations.RunPython(create_arc_cache, drop_arc_cache),
    ]
