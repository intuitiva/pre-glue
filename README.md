# Proceso Pre-Glue (XML.GZ -> Zauru -> JSON -> Glue -> Zauru y TXT -> Zauru -> Glue -> Zauru):

Este proyecto consiste en habilitar una función lambda que se pueda llamar cada vez que en un bucket S3 se deposite un archivo.

Este archivo debe transofarse si es necesario, si el archivo es .xml.gz hay que transformarlo a JSON y luego llamar un AWS Glue Job.

El AWS Glue Job (ETL) recibe varios parámetros:

1. job_uuid (el UUD generado en esta función)
2. raw_file (el archivo recién recibido en S3 y que causó la llamada a la función)
3. entity_id (la primera parte del metadato de token)

Este proyecto está hecho como una GRAN función AWS lambda en Node.js donde se manejarán ambos casos:

1. XML.GZ -> Zauru -> JSON -> Glue -> Zauru
2. TXT -> Zauru -> Glue -> Zauru

## Deploy con Serverless Framework
1. npm install
2. configurar .env (ejemplo en el siguiente punto)
2. serverless deploy

> Gracias al Serverless Framework, en donde los permisos IAM se definen en el código, no hay que configurar nada para poder subir el código. Solo tenemos que asegurarnos que el .env esté correcto (siguiente punto)

### Variables de entorno a configurar en el archivo .env
```
AWS_S3_ACCESS_KEY=SECRET1
AWS_S3_SECRET_KEY=SECRET2
AWS_AZ_REGION=us-east-1
AWS_S3_BUCKET_SOURCE=source_bucket
AWS_S3_BUCKET_DESTINATION=destination_bucket
ZAURU_POST_URL=https://app.zauru.com/data_import_jobs.json
ZAURU_PUT_URL=https://app.zauru.com/data_import_jobs/
ZAURU_HEADER_USER_EMAIL=pruebas@zauru.com
ZAURU_HEADER_USER_TOKEN=SOsdfpSPDSpsosFUFJ
AWS_GLUE_JOB_NAME=glue-test-job
```

## Configuración de AWS S3 para que haga trigger esta función

1. Entrar al bucket que queremos que monitoree los archivos que son depositados allí para que sean trabajados por esta función lambda
2. Entrar a propiedades del bucket
3. Entrar a eventos y seleccionar "+ Añadir notificación"
4. Seleccionar los eventos PUT y POST
5. En "Enviar a" seleccionar "Función de Lambda"
6. Seleccionar en "Lambda" esta función.

Licencia ISC