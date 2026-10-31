pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        APP_SERVER = '18.61.177.110'
        APP_USER = 'ubuntu'
        APP_DIR = '/home/ubuntu/BlogReact'

        SSH_CREDENTIAL_ID = 'app-ec2-ssh'

        GIT_REPOSITORY = 'https://github.com/chandrakumarc11/BlogReact.git'
        GIT_BRANCH = 'main'

        DOCKER_NETWORK = 'blog-network'

        BACKEND_IMAGE = 'blog-backend'
        FRONTEND_IMAGE = 'blog-frontend'

        BACKEND_CONTAINER = 'blog-backend-test'
        FRONTEND_CONTAINER = 'blog-frontend'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm

                sh '''
                    echo "Jenkins workspace:"
                    pwd

                    echo "Repository contents:"
                    ls -la

                    test -d frontend
                    test -d backend
                    test -f frontend/Dockerfile
                    test -f backend/Dockerfile
                '''
            }
        }

        // ==============================
        // SONARQUBE CODE ANALYSIS
        // ==============================
        stage('SonarQube Analysis') {
            steps {
                script {
                    def scannerHome = tool 'SonarScanner'

                    withSonarQubeEnv('SonarQube') {
                        sh """
                            ${scannerHome}/bin/sonar-scanner \
                              -Dsonar.projectKey=BlogReact \
                              -Dsonar.projectName=BlogReact \
                              -Dsonar.sources=. \
                              -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/coverage/**
                        """
                    }
                }
            }
        }

        stage('Verify SSH Connection') {
            steps {
                sshagent(credentials: ["${SSH_CREDENTIAL_ID}"]) {
                    sh '''
                        ssh \
                          -o BatchMode=yes \
                          -o StrictHostKeyChecking=no \
                          -o ConnectTimeout=10 \
                          ${APP_USER}@${APP_SERVER} \
                          "echo 'SSH connection successful'; hostname"
                    '''
                }
            }
        }

        // Keep the rest of your existing stages here:
        // Update Source on Application EC2
        // Build Docker Images
        // Deploy Backend
        // Backend Health Check
        // Deploy Frontend
        // Application Verification
    }
}
