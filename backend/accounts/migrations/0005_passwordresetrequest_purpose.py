from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_passwordresetrequest'),
    ]

    operations = [
        migrations.AddField(
            model_name='passwordresetrequest',
            name='purpose',
            field=models.CharField(default='password', max_length=20),
        ),
    ]
